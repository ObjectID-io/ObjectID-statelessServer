import type { Request, Response } from "express";
import type { ExecutionStatus, IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

export default async function create_object(req: Request, res: Response) {
  try {
    const {
      seed,
      network,
      creditToken,
      OIDcontrollerCap,
      object_type,
      product_url,
      product_img_url,
      description,
      op_code,
      immutable_metadata,
      mutable_metadata,
      geo_location,
    } = req.body;

    logInputs("create_object", {
      network,
      creditToken,
      OIDcontrollerCap,
      object_type,
      product_url,
      product_img_url,
      description,
      op_code,
      immutable_metadata,
      mutable_metadata,
      geo_location,
    });

    const { client, keyPair, policy, gasStation, packageID } = await setupEnv(seed, network);

    const tx = new Transaction();
    const moveFunction = packageID + "::oid_object::create_object";

    logInputs("create_object", {
      network,
      creditToken,
      policy,
      OIDcontrollerCap,
      object_type,
      product_url,
      op_code,
      immutable_metadata,
      mutable_metadata,
      geo_location,
    });

    tx.moveCall({
      arguments: [
        tx.object(creditToken),
        tx.object(policy),
        tx.object(OIDcontrollerCap),
        tx.pure.string(object_type),
        tx.pure.string(product_url),
        tx.pure.string(product_img_url),
        tx.pure.string(description),
        tx.pure.string(op_code),
        tx.pure.string(JSON.stringify(immutable_metadata)),
        tx.pure.string(JSON.stringify(mutable_metadata)),
        tx.pure.string(geo_location),
        tx.object("0x6"),
      ],
      target: moveFunction,
    });

    const sender = keyPair.toIotaAddress();
    tx.setGasBudget(10_000_000);
    tx.setSender(sender);

    singAndExecTx(network, client, gasStation, useGasStation, keyPair, tx, {
      onSuccess: (result: IotaTransactionBlockResponse) => {
        const status = result.effects?.status as ExecutionStatus;
        const txDigest = result.digest;

        if (status.status === "success") {
          const newObjectId = result.effects?.created?.[0]?.reference?.objectId;
          res.json({ success: true, txDigest, newObjectId });
          console.log("Success, txDigest: ", txDigest, newObjectId);
        } else {
          res.json({ success: false, txDigest, error: status.error });
          console.error("Object creation failed.");
        }
      },
      onError: (err: any) => {
        res.json({ success: false, undefined, error: undefined });
        console.error("Object creation failed:", err);
      },
      onSettled: () => {},
    });
  } catch (err) {
    console.error("Unexpected error:", err);
  }
}
