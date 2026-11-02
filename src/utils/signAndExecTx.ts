import { Transaction } from "@iota/iota-sdk/transactions";
import type { IotaClient, IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { Ed25519Keypair, Ed25519PublicKey } from "@iota/iota-sdk/keypairs/ed25519";
import { loadPublicOnChainConfig } from "./onchainConfig";
import { applySponsorGas, prepareSponsoredGas, sponsorshipMode, submitSponsoredBytes } from "./sponsorship";

export interface Account {
  role: string; keypair: Ed25519Keypair; publicKey: Ed25519PublicKey;
  address: string; balance: string;
}
export type gasStationCfg = {
  gasStation1URL: string; gasStation1Token: string;
  gasStation2URL: string; gasStation2Token: string;
};

/** Public on-chain config selects sponsorship, including for Identity BCS. */
export async function executeConfiguredTransaction(
  network: string, client: IotaClient, keyPair: Ed25519Keypair,
  tx: Transaction, requestedBudget?: number,
): Promise<IotaTransactionBlockResponse> {
  if (!["mainnet", "testnet", "iota"].includes(network)) throw new Error("Unsupported sponsorship network");
  const loaded = await loadPublicOnChainConfig(network, client);
  const expectedNetwork = network === "iota" ? "mainnet" : network;
  if (loaded.json.network && (loaded.json.network === "iota" ? "mainnet" : loaded.json.network) !== expectedNetwork) {
    throw new Error("On-chain configuration network mismatch");
  }
  const sender = keyPair.toIotaAddress();
  if (sponsorshipMode(loaded.json) === "direct") {
    if (loaded.json.useGasStation !== false) throw new Error("Missing on-chain sponsorship configuration");
    const budget = Number(String(loaded.json.gasBudget ?? requestedBudget ?? 50_000_000).replace(/_/g, ""));
    if (!Number.isSafeInteger(budget) || budget <= 0) throw new Error("Invalid gasBudget");
    tx.setSender(sender); tx.setGasOwner(sender); tx.setGasPayment([]);
    tx.setGasBudget(budget); tx.setGasPrice(await client.getReferenceGasPrice());
    const submitted = await client.signAndExecuteTransaction({ signer: keyPair, transaction: tx });
    try {
      const result = await client.waitForTransaction({ digest: submitted.digest, options: { showEffects: true, showObjectChanges: true, showEvents: true } });
      if (result.effects?.status.status !== "success") throw new Error(result.effects?.status.error ?? "Transaction failed");
      return result;
    } catch (error) {
      if (error && typeof error === "object") Object.assign(error, { digest: submitted.digest });
      throw error;
    }
  }
  const gas = await prepareSponsoredGas(client, network, requestedBudget, loaded);
  try {
    applySponsorGas(tx, gas, sender);
    const bytes = await tx.build({ client });
    const signed = await keyPair.signTransaction(bytes);
    return await submitSponsoredBytes(client, gas, bytes, [signed.signature]);
  } finally { gas.release(); }
}

export async function singAndExecTx(
  network: string, client: IotaClient, _gasStation: gasStationCfg,
  _useGasStation: boolean, keyPair: Ed25519Keypair, tx: Transaction,
  callbacks: {
    onSuccess: (result: IotaTransactionBlockResponse) => void;
    onError: (err: unknown) => void;
    onSettled?: () => void;
  }, gasBudget?: number,
) {
  try {
    let result: IotaTransactionBlockResponse;
    try { result = await executeConfiguredTransaction(network, client, keyPair, tx, gasBudget); }
    catch (error) { callbacks.onError(error); return { tx_effect: null, success: false }; }
    callbacks.onSuccess(result);
    return { tx_effect: result, success: true };
  } finally { callbacks.onSettled?.(); }
}
export default singAndExecTx;
