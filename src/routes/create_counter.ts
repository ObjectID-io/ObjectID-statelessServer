import type { Request, Response } from "express";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

export default async function create_counter(req: Request, res: Response) {
  try {
    const {
      seed,
      network,
      creditToken,
      controllerCap,
      object,
      value,
      unit,
      step,
      immutable_metadata,
      mutable_metadata,
    } = req.body;

    logInputs("create_counter", {
      network,
      creditToken,
      controllerCap,
      object,
      value,
      unit,
      step,
      immutable_metadata,
      mutable_metadata,
    });

    const { client, keyPair, policy, gasStation, packageID } = await setupEnv(seed, network);

    const tx = new Transaction();
    const moveFunction = packageID + "::oid_object::create_counter";

    tx.moveCall({
      arguments: [
        tx.object(creditToken),
        tx.object(policy),
        tx.object(controllerCap),
        tx.pure.address(object),
        tx.pure.u64(value),
        tx.pure.string(unit),
        tx.pure.u64(step),
        tx.pure.string(immutable_metadata),
        tx.pure.string(mutable_metadata),
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
