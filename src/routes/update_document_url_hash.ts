import type { Request, Response } from "express";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation, asJsonString } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

export default async function update_document_url_hash(req: Request, res: Response) {
  try {
    const { seed, network, controllerCap, document, new_hash, new_document_url } = req.body;

    logInputs("update_document_url_hash", {
      network,
      controllerCap,
      document,
      new_hash,
      new_document_url,
    });

    const { client, keyPair, policy, gasStation, documentPackageID } = await setupEnv(seed, network);

    const tx = new Transaction();
    const moveFunction = documentPackageID + "::oid_document::update_document_url_hash";

    tx.moveCall({
      arguments: [
        tx.object(controllerCap),
        tx.object(document),
        tx.pure.string(new_hash),
        tx.pure.string(new_document_url),
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
