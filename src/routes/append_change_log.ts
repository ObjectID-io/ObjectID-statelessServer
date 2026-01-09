import type { Request, Response } from "express";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation, asJsonString } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

export default async function append_change_log(req: Request, res: Response) {
  try {
    const { seed, network, document, actor, op_desc, params } = req.body;

    logInputs("append_change_log", {
      network,
      document,
      actor,
      op_desc,
      params,
    });

    const { client, keyPair, policy, gasStation, documentPackageID } = await setupEnv(seed, network);

    const tx = new Transaction();
    const moveFunction = documentPackageID + "::oid_document::append_change_log";

    tx.moveCall({
      arguments: [
        tx.object(document),
        tx.pure.string(actor),
        tx.pure.string(op_desc),
        tx.pure.string(params),
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
