import type { Request, Response } from "express";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv } from "./_common";
import {
  bcsBytes,
  bcsU64,
  bcsU8,
  CLOCK_ID,
  executeSponsoredStorageTransaction,
  moveValueToString,
  parseMoveFields,
} from "../utils/storageMove";

export default async function extend_storage(req: Request, res: Response) {
  try {
    const {
      seed,
      network,
      creditToken,
      OIDcontrollerCap,
      IOTAcontrollerCap,
      identityControllerCap,
      objectId,
      oracleTaskId,
      creditsToBurn,
      plannedDeletionAtMs,
      paymentIota,
      oraclePriceIota,
      requestedNodes,
      quorumK,
      oraclePayload,
      oraclePayloadText,
      retentionDays,
      declaredDownloadBytes,
      mediationMode,
      varianceMax,
      startScheduleMs,
      endScheduleMs,
      intervalMs,
    } = req.body;

    logInputs("extend_storage", {
      network,
      creditToken,
      IOTAcontrollerCap: IOTAcontrollerCap || identityControllerCap || OIDcontrollerCap,
      objectId,
      oracleTaskId,
      creditsToBurn,
      plannedDeletionAtMs,
      paymentIota,
      retentionDays,
      requestedNodes,
      quorumK,
      intervalMs,
      startScheduleMs,
      endScheduleMs,
    });

    const env = await setupEnv(seed, network);
    const controllerCap = IOTAcontrollerCap || identityControllerCap || OIDcontrollerCap;
    if (!controllerCap) throw new Error("IOTAcontrollerCap is required");
    if (!retentionDays && !oracleTaskId) throw new Error("retentionDays is required when oracleTaskId cannot be used to derive it");

    const controllerCapObject = await env.client.getObject({ id: controllerCap, options: { showType: true } });
    const controllerCapType = String(controllerCapObject?.data?.type || "");
    if (controllerCapType.includes("::oid_identity::ControllerCap")) {
      throw new Error("IOTAcontrollerCap must be the IOTA Identity controller cap, not the OID identity ControllerCap");
    }

    const task = await env.client.getObject({
      id: oracleTaskId,
      options: { showContent: true, showType: true },
    });
    const taskFields = parseMoveFields(task);
    const paymentAmount = BigInt(String(paymentIota || oraclePriceIota || (BigInt(String(creditsToBurn || 0)) * BigInt(env.storageCreditValueIota))));

    const tx = new Transaction();
    const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure(bcsU64(paymentAmount))]);

    tx.moveCall({
      target: `${env.storagePackageID}::oid_storage::extend_storage_retention_with_oracle_top_up`,
      arguments: [
        tx.object(creditToken),
        tx.object(env.storagePolicyID),
        tx.object(controllerCap),
        tx.object(objectId),
        tx.object(env.oracleTaskRegistryID),
        tx.object(env.oracleStateID),
        tx.object(env.oracleNodeRegistryID),
        tx.object(oracleTaskId),
        paymentCoin,
        tx.pure.u64(String(creditsToBurn || 0)),
        tx.pure.u64(String(plannedDeletionAtMs || 0)),
        tx.pure.string(paymentAmount.toString()),
        tx.pure(bcsU64(requestedNodes || moveValueToString(taskFields.requested_nodes) || 1)),
        tx.pure(bcsU64(quorumK || moveValueToString(taskFields.quorum_k) || 1)),
        tx.pure(bcsBytes(oraclePayload ?? oraclePayloadText ?? taskFields.payload ?? {})),
        tx.pure(bcsU64(retentionDays || moveValueToString(taskFields.retention_days) || 1)),
        tx.pure(bcsU64(declaredDownloadBytes || moveValueToString(taskFields.declared_download_bytes) || 0)),
        tx.pure(bcsU8(mediationMode || moveValueToString(taskFields.mediation_mode) || 0)),
        tx.pure(bcsU64(varianceMax || moveValueToString(taskFields.variance_max) || 0)),
        tx.pure(bcsU64(startScheduleMs || moveValueToString(taskFields.start_schedule_ms) || Date.now())),
        tx.pure(bcsU64(endScheduleMs || moveValueToString(taskFields.end_schedule_ms) || 0)),
        tx.pure(bcsU64(intervalMs || moveValueToString(taskFields.interval_ms) || 0)),
        tx.object(CLOCK_ID),
      ],
    });

    const txEffect = await executeSponsoredStorageTransaction(network, env.client, env.keyPair, tx, paymentAmount);
    res.json({ success: true, txDigest: txEffect.digest, effects: txEffect.effects, objectChanges: txEffect.objectChanges });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
}
