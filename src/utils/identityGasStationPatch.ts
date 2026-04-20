import axios from "axios";
import { toB64 } from "@iota/bcs";
import type { IotaClient, IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { TransactionDataBuilder } from "@iota/iota-sdk/transactions";
import type { gasStationCfg } from "./signAndExecTx";
import { getSponsorGas } from "./signAndExecTx";

type PendingSponsoredTx = {
  gasStationUrl: string;
  reservationId: number;
  options?: Record<string, unknown>;
};

type PatchedIotaClient = IotaClient & {
  executeTransactionBlock: (input: {
    transactionBlock: string | Uint8Array;
    signature: string | string[];
    options?: Record<string, unknown>;
  }) => Promise<IotaTransactionBlockResponse>;
};

const identityHelpers = require("@iota/iota-interaction-ts/node/iota_client_helpers") as {
  addGasDataToTransaction: (
    client: IotaClient,
    senderAddress: string,
    txBcs: Uint8Array,
    gasBudget?: bigint,
  ) => Promise<Uint8Array>;
};

const gasStationByClient = new WeakMap<IotaClient, gasStationCfg>();
const pendingByClient = new WeakMap<IotaClient, Map<string, PendingSponsoredTx>>();
const originalAddGasDataToTransaction = identityHelpers.addGasDataToTransaction;
const originalExecuteTransactionBlock = (require("@iota/iota-sdk/client").IotaClient as typeof IotaClient).prototype
  .executeTransactionBlock as PatchedIotaClient["executeTransactionBlock"];

let patched = false;

function getPendingMap(client: IotaClient): Map<string, PendingSponsoredTx> {
  let map = pendingByClient.get(client);
  if (!map) {
    map = new Map<string, PendingSponsoredTx>();
    pendingByClient.set(client, map);
  }
  return map;
}

async function reserveGasWithFallback(gasStation: gasStationCfg, gasBudget: number) {
  try {
    const result = await getSponsorGas(gasBudget, gasStation.gasStation1URL, gasStation.gasStation1Token);
    return { ...result, gasStationUrl: gasStation.gasStation1URL };
  } catch (primaryError) {
    if (!gasStation.gasStation2URL || !gasStation.gasStation2Token) {
      throw primaryError;
    }

    const result = await getSponsorGas(gasBudget, gasStation.gasStation2URL, gasStation.gasStation2Token);
    return { ...result, gasStationUrl: gasStation.gasStation2URL };
  }
}

async function waitForSponsoredDigest(
  client: IotaClient,
  digest: string,
  options?: Record<string, unknown>,
): Promise<IotaTransactionBlockResponse> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await client.getTransactionBlock({
        digest,
        options: {
          showEffects: true,
          showInput: true,
          showRawInput: true,
          showEvents: true,
          showObjectChanges: true,
          showBalanceChanges: true,
          showRawEffects: false,
          ...(options ?? {}),
        },
      });
    } catch (error) {
      if (attempt === 9) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Unable to fetch sponsored transaction ${digest}.`);
}

export function registerIdentityGasStation(client: IotaClient, gasStation: gasStationCfg) {
  gasStationByClient.set(client, gasStation);

  if (patched) {
    return;
  }

  identityHelpers.addGasDataToTransaction = async (
    clientArg: IotaClient,
    senderAddress: string,
    txBcs: Uint8Array,
    gasBudget?: bigint,
  ) => {
    const clientGasStation = gasStationByClient.get(clientArg);
    if (!clientGasStation) {
      return originalAddGasDataToTransaction(clientArg, senderAddress, txBcs, gasBudget);
    }

    const budget = Number(gasBudget ?? 50_000_000n);
    const gasPrice = await clientArg.getReferenceGasPrice();
    const sponsoredGas = await reserveGasWithFallback(clientGasStation, budget);
    const txData = TransactionDataBuilder.fromBytes(txBcs);

    txData.sender = senderAddress;
    txData.gasData = {
      owner: sponsoredGas.sponsor_address,
      payment: sponsoredGas.gas_coins,
      budget: budget.toString(),
      price: gasPrice.toString(),
    };

    const builtTx = txData.build({
      overrides: {
        sender: senderAddress,
        gasData: txData.gasData,
      },
    });

    getPendingMap(clientArg).set(toB64(builtTx), {
      gasStationUrl: sponsoredGas.gasStationUrl,
      reservationId: sponsoredGas.reservation_id,
    });

    return builtTx;
  };

  (require("@iota/iota-sdk/client").IotaClient as typeof IotaClient).prototype.executeTransactionBlock = async function (
    this: IotaClient,
    input: {
      transactionBlock: string | Uint8Array;
      signature: string | string[];
      options?: Record<string, unknown>;
    },
  ) {
    const txBytesB64 =
      typeof input.transactionBlock === "string" ? input.transactionBlock : toB64(input.transactionBlock);
    const pending = getPendingMap(this).get(txBytesB64);

    if (!pending) {
      return originalExecuteTransactionBlock.call(this as PatchedIotaClient, input);
    }

    try {
      const signatures = Array.isArray(input.signature) ? input.signature : [input.signature];
      const userSignature = signatures[0];

      if (!userSignature) {
        throw new Error("Missing user signature for sponsored identity transaction.");
      }

      const response = await axios.post(`${pending.gasStationUrl}/v1/execute_tx`, {
        reservation_id: pending.reservationId,
        tx_bytes: txBytesB64,
        user_sig: userSignature,
      });

      const digest = String(response?.data?.effects?.transactionDigest ?? "").trim();
      if (!digest) {
        throw new Error("Gas station response did not include a transaction digest.");
      }

      return await waitForSponsoredDigest(this, digest, input.options);
    } finally {
      getPendingMap(this).delete(txBytesB64);
    }
  };

  patched = true;
}
