import type { Request, Response } from "express";
import type { ExecutionStatus, IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

export default async function update_object(req: Request, res: Response) {
  try {
    const { seed, network, creditToken, controllerCap, object, new_product_img_url, new_description } = req.body;

    logInputs("update_object", { network, creditToken, controllerCap, object, new_product_img_url, new_description });

    const { client, keyPair, policy, gasStation, packageID } = await setupEnv(seed, network);

    const tx = new Transaction();
    const moveFunction = packageID + "::oid_object::update_object";

    tx.moveCall({
      arguments: [
        tx.object(creditToken),
        tx.object(policy),
        tx.object(controllerCap),
        tx.object(object),
        tx.pure.string(new_product_img_url),
        tx.pure.string(new_description),
        tx.object("0x6"),
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
          console.error("update_object failed.");
        }
      },
      onError: (err: any) => {
        res.json({ success: false, error: err });
        console.error("update_object failed:", err);
      },
      onSettled: () => {},
    });
  } catch (err) {
    console.error("Unexpected error:", err);
  }
}
