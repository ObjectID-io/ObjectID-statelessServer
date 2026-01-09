import type { Request, Response } from "express";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation, asJsonString } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

export default async function update_publisher_did(req: Request, res: Response) {
  try {
    const { seed, network, controllerCap, document, new_publisher_did } = req.body;

    logInputs("update_publisher_did", {
      network,
      controllerCap,
      document,
      new_publisher_did,
    });

    const { client, keyPair, policy, gasStation, documentPackageID } = await setupEnv(seed, network);

    const tx = new Transaction();
    const moveFunction = documentPackageID + "::oid_document::update_publisher_did";

    tx.moveCall({
      arguments: [tx.object(controllerCap), tx.object(document), tx.pure.string(new_publisher_did)],
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
