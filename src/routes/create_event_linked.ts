import type { Request, Response } from "express";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

export default async function create_event_linked(req: Request, res: Response) {
  try {
    const {
      seed,
      network,
      creditToken,
      OIDcontrollerCap,
      object,
      event_type,
      immutable_metadata,
      mutable_metadata,
    } = req.body;

    logInputs("create_event_linked", {
      network,
      creditToken,
      OIDcontrollerCap,
      object,
      event_type,
      immutable_metadata,
      mutable_metadata,
    });

    if (!OIDcontrollerCap || typeof OIDcontrollerCap !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'OIDcontrollerCap'." });
      return;
    }

    const { client, keyPair, policy, gasStation, packageID } = await setupEnv(seed, network);

    const tx = new Transaction();
    const moveFunction = packageID + "::oid_object::create_event_linked";

    tx.moveCall({
      arguments: [
        tx.object(creditToken),
        tx.object(policy),
        tx.object(OIDcontrollerCap),
        tx.object(object),
        tx.pure.string(String(event_type ?? "")),
        tx.pure.string(typeof immutable_metadata === "string" ? immutable_metadata : JSON.stringify(immutable_metadata ?? {})),
        tx.pure.string(typeof mutable_metadata === "string" ? mutable_metadata : JSON.stringify(mutable_metadata ?? {})),
        tx.object("0x6"),
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
  } catch (err: any) {
    console.error("Unexpected error:", err);
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
}
