import type { Request, Response } from "express";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation, asJsonString } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

export default async function approve_document(req: Request, res: Response) {
  try {
    const { seed, network, controllerCap, document, new_approval_flag } = req.body;

    logInputs("approve_document", {
      network,
      controllerCap,
      document,
      new_approval_flag,
    });

    const { client, keyPair, policy, gasStation, documentPackageID } = await setupEnv(seed, network);

    const tx = new Transaction();
    const moveFunction = documentPackageID + "::oid_document::approve_document";

    tx.moveCall({
      arguments: [
        tx.object(controllerCap),
        tx.object(document),
        tx.pure.u8(Number(new_approval_flag)),
        tx.object("0x6"),
      ],
      target: moveFunction,
    });

    tx.setGasBudget(10_000_000);

    await singAndExecTx(network, client, gasStation, useGasStation, keyPair, tx, {
      onSuccess: (result) => res.json({ success: true, txDigest: result.digest, effects: result.effects }),
      onError: (err) => res.json({ success: false, error: err }),
      onSettled: () => {},
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.json({ success: false, error: String(err) });
  }
}
