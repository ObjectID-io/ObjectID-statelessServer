import type { Request, Response } from "express";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

export default async function counter_set_value(req: Request, res: Response) {
  try {
    const { seed, network, creditToken, controllerCap, objectId, counter, new_value } = req.body;

    logInputs("counter_set_value", {
      network,
      creditToken,
      controllerCap,
      objectId,
      counter,
      new_value,
    });

    const { client, keyPair, policy, gasStation, packageID } = await setupEnv(seed, network);

    const tx = new Transaction();
    const moveFunction = packageID + "::oid_object::counter_set_value";

    tx.moveCall({
      arguments: [
        tx.object(creditToken),
        tx.object(policy),
        tx.object(controllerCap),
        tx.object(objectId),
        tx.object(counter),
        tx.pure.u64(new_value),
      ],
      target: moveFunction,
    });

    tx.setGasBudget(10_000_000);
    tx.setSender(keyPair.toIotaAddress());

    singAndExecTx(network, client, gasStation, useGasStation, keyPair, tx, {
      onSuccess: (result) => res.json({ success: true, txDigest: result.digest }),
      onError: (err) => res.json({ success: false, error: err }),
      onSettled: () => {},
    });
  } catch (err) {
    console.error("Unexpected error:", err);
  }
}
