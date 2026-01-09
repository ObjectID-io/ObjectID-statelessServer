import type { Request, Response } from "express";
import type { ExecutionStatus, IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

export default async function anonymous_message(req: Request, res: Response) {
  try {
    const { seed, network, object, geolocation } = req.body;

    logInputs("anonymous_message", { network, object, geolocation });

    const { client, keyPair, gasStation, packageID } = await setupEnv(seed, network);

    const tx = new Transaction();
    const moveFunction = packageID + "::oid_object::anonymous_message";

    tx.moveCall({
      arguments: [tx.object(object), tx.pure.string(geolocation)],
      target: moveFunction,
    });

    tx.setGasBudget(10_000_000);
    tx.setSender(keyPair.toIotaAddress());

    singAndExecTx(network, client, gasStation, useGasStation, keyPair, tx, {
      onSuccess: (result: IotaTransactionBlockResponse) => {
        const status = result.effects?.status as ExecutionStatus;
        const txDigest = result.digest;

        if (status.status === "success") {
          res.json({ success: true, txDigest });
          console.log("Success, txDigest: ", txDigest);
        } else {
          res.json({ success: false, txDigest, error: status.error });
          console.error("anonymous_message failed.");
        }
      },
      onError: (err: any) => {
        res.json({ success: false, error: err });
        console.error("anonymous_message failed:", err);
      },
      onSettled: () => {},
    });
  } catch (err) {
    console.error("Unexpected error:", err);
  }
}
