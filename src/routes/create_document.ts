import type { Request, Response } from "express";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation, asJsonString } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

export default async function create_document(req: Request, res: Response) {
  try {
    const {
      seed,
      network,
      creditToken,
      OIDcontrollerCap,
      document_url,
      description,
      immutable_metadata,
      mutable_metadata,
    } = req.body;

    logInputs("create_document", {
      network,
      creditToken,
      OIDcontrollerCap,
      document_url,
      description,
      immutable_metadata,
      mutable_metadata,
    });

    const { client, keyPair, policy, gasStation, documentPackageID } = await setupEnv(seed, network);

    const tx = new Transaction();
    const moveFunction = documentPackageID + "::oid_document::create_document";

    tx.moveCall({
      arguments: [
        tx.object(creditToken),
        tx.object(policy),
        tx.object(OIDcontrollerCap),
        tx.pure.string(document_url),
        tx.pure.string(description),
        tx.pure.string(asJsonString(immutable_metadata)),
        tx.pure.string(asJsonString(mutable_metadata)),
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
