import type { Request, Response } from "express";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation, asJsonString } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

export default async function remove_editors_did(req: Request, res: Response) {
  try {
    const { seed, network, controllerCap, document, editor_did } = req.body;

    logInputs("remove_editors_did", {
      network,
      controllerCap,
      document,
      editor_did,
    });

    const { client, keyPair, policy, gasStation, documentPackageID } = await setupEnv(seed, network);

    const tx = new Transaction();
    const moveFunction = documentPackageID + "::oid_document::remove_editors_did";

    tx.moveCall({
      arguments: [tx.object(controllerCap), tx.object(document), tx.pure.string(editor_did)],
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
