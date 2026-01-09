import type { Request, Response } from "express";
import type { ExecutionStatus, IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

export default async function control_message(req: Request, res: Response) {
  try {
    const { seed, network, creditToken, controllerCap, object, message, message_code, geolocation, link } = req.body;

    logInputs("control_message", {
      network,
      creditToken,
      controllerCap,
      object,
      message,
      message_code,
      geolocation,
      link,
    });

    const { client, keyPair, policy, gasStation, packageID } = await setupEnv(seed, network);

    const tx = new Transaction();
    const moveFunction = packageID + "::oid_object::control_message";

    tx.moveCall({
      arguments: [
        tx.object(creditToken),
        tx.object(policy),
        tx.object(controllerCap),
        tx.object(object),
        tx.pure.string(message),
        tx.pure.u16(message_code),
        tx.pure.string(geolocation),
        tx.pure.string(link),
      ],
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
          console.error("control_message failed.");
        }
      },
      onError: (err: any) => {
        res.json({ success: false, error: err });
        console.error("control_message failed:", err);
      },
      onSettled: () => {},
    });
  } catch (err) {
    console.error("Unexpected error:", err);
  }
}
