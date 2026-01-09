import type { Request, Response } from "express";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

export default async function update_event_mutable_metadata(req: Request, res: Response) {
  try {
    const { seed, network, creditToken, controllerCap, event, new_mutable_metadata } = req.body;

    logInputs("update_event_mutable_metadata", {
      network,
      creditToken,
      controllerCap,
      event,
      new_mutable_metadata,
    });

    const { client, keyPair, policy, gasStation, packageID } = await setupEnv(seed, network);

    const tx = new Transaction();
    const moveFunction = packageID + "::oid_object::update_event_mutable_metadata";

    tx.moveCall({
      arguments: [
        tx.object(creditToken),
        tx.object(policy),
        tx.object(controllerCap),
        tx.object(event),
        tx.pure.string(new_mutable_metadata),
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
