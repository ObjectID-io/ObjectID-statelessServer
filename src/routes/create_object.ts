import type { Request, Response } from "express";
import type { ExecutionStatus, IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation } from "./_common";
import { singAndExecTx } from "../utils/signAndExecTx";

const STALE_OBJECT_ERROR_PATTERN = /not available for consumption|current version:/i;
const MAX_STALE_OBJECT_RETRIES = 4;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;

  const maybeObject = err as Record<string, any>;
  const responseError = maybeObject?.response?.data?.error;
  if (typeof responseError === "string" && responseError.trim()) return responseError.trim();

  if (typeof maybeObject?.message === "string" && maybeObject.message.trim()) return maybeObject.message.trim();

  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isStaleObjectError(message: string): boolean {
  return STALE_OBJECT_ERROR_PATTERN.test(message);
}

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

    for (let attempt = 1; attempt <= MAX_STALE_OBJECT_RETRIES; attempt += 1) {
      const tx = new Transaction();
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

      try {
        const result = await new Promise<IotaTransactionBlockResponse>((resolve, reject) => {
          void singAndExecTx(network, client, gasStation, useGasStation, keyPair, tx, {
            onSuccess: resolve,
            onError: reject,
            onSettled: () => {},
          });
        });

        const status = result.effects?.status as ExecutionStatus;
        const txDigest = result.digest;

        if (status.status === "success") {
          const newObjectId = result.effects?.created?.[0]?.reference?.objectId;
          res.json({ success: true, txDigest, newObjectId });
          console.log("Success, txDigest: ", txDigest, newObjectId);
          return;
        }

        const errorMessage = String(status.error || "Object creation failed").trim();
        if (attempt < MAX_STALE_OBJECT_RETRIES && isStaleObjectError(errorMessage)) {
          console.warn(`create_object retry ${attempt}/${MAX_STALE_OBJECT_RETRIES} after stale object error: ${errorMessage}`);
          await wait(attempt * 400);
          continue;
        }

        res.json({ success: false, txDigest, error: errorMessage });
        console.error("Object creation failed.");
        return;
      } catch (err) {
        const errorMessage = extractErrorMessage(err);
        if (attempt < MAX_STALE_OBJECT_RETRIES && isStaleObjectError(errorMessage)) {
          console.warn(`create_object retry ${attempt}/${MAX_STALE_OBJECT_RETRIES} after stale object error: ${errorMessage}`);
          await wait(attempt * 400);
          continue;
        }

        res.json({ success: false, error: errorMessage });
        console.error("Object creation failed:", err);
        return;
      }
    }
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ success: false, error: extractErrorMessage(err) });
  }
}
