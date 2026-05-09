import type { Request, Response } from "express";
import { Transaction } from "@iota/iota-sdk/transactions";
import axios from "axios";
import { logInputs, setupEnv } from "./_common";
import { asJsonStorageString, bcsBytes, bcsU64, bcsU8, CLOCK_ID, executeSponsoredStorageTransaction } from "../utils/storageMove";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function create_storage(req: Request, res: Response) {
  try {
    const {
      seed,
      network,
      creditToken,
      OIDcontrollerCap,
      IOTAcontrollerCap,
      identityControllerCap,
      fileName,
      mimeType,
      fileSizeBytes,
      sha256,
      tempUrl,
      plannedDeletionAtMs,
      creditsToBurn,
      priceEurCentsPerCredit,
      oracleProfileId,
      oracleTemplateId,
      oraclePriceIota,
      immutableMetadata,
      mutableMetadata,
      requestedNodes,
      quorumK,
      oraclePayload,
      oraclePayloadText,
      allowCustomOraclePayload,
      retentionDays,
      declaredDownloadBytes,
      mediationMode,
      varianceMax,
      createResultControllerCap,
      startScheduleMs,
      endScheduleMs,
      intervalMs,
      executionCount,
      paymentIota,
    } = req.body;

    const templateId = Number(oracleTemplateId || 4);
    const nodes = Number(requestedNodes || 1);
    const quorum = Number(quorumK || 1);
    const retention = Number(retentionDays || 30);
    const credits = Number(creditsToBurn || 0);
    const startMs = Number(startScheduleMs || Date.now());
    const runCount = Math.max(1, Number(executionCount || 1));
    const scheduleIntervalMs = Number(intervalMs ?? (runCount > 1 ? retention * DAY_MS : 0));
    const endMs = Number(endScheduleMs ?? (scheduleIntervalMs > 0 ? startMs + scheduleIntervalMs * (runCount - 1) : 0));
    const plannedDeletionMs = Number(plannedDeletionAtMs || startMs + retention * DAY_MS * runCount);
    const generatedPayloadText = JSON.stringify({
      url: tempUrl,
      sha256,
      fileName,
      mimeType: mimeType || "application/octet-stream",
      size: Number(fileSizeBytes || 0),
      execution_count: runCount,
      interval_days: scheduleIntervalMs > 0 ? scheduleIntervalMs / DAY_MS : 0,
    });
    const payloadText = String(allowCustomOraclePayload ? (oraclePayloadText || generatedPayloadText) : generatedPayloadText);
    const declaredBytes = Number(declaredDownloadBytes || fileSizeBytes || 0);
    const paymentText = String(paymentIota || oraclePriceIota || BigInt(Math.max(0, credits)) * BigInt(envStorageCreditValueFallback()));

    logInputs("create_storage", {
      network,
      creditToken,
      IOTAcontrollerCap: IOTAcontrollerCap || identityControllerCap || OIDcontrollerCap,
      fileName,
      fileSizeBytes,
      sha256,
      tempUrl,
      plannedDeletionAtMs: plannedDeletionMs,
      creditsToBurn: credits,
      oracleTemplateId: templateId,
      paymentIota: paymentText,
      retentionDays: retention,
      requestedNodes: nodes,
      quorumK: quorum,
      intervalMs: scheduleIntervalMs,
      startScheduleMs: startMs,
      endScheduleMs: endMs,
      executionCount: runCount,
    });

    const env = await setupEnv(seed, network);
    const controllerCap = IOTAcontrollerCap || identityControllerCap || OIDcontrollerCap;
    if (!controllerCap) throw new Error("IOTAcontrollerCap is required");
    if (!credits) throw new Error("creditsToBurn is required");
    if (!tempUrl) throw new Error("tempUrl is required");
    if (!sha256) throw new Error("sha256 is required");
    if (!fileSizeBytes) throw new Error("fileSizeBytes is required");

    const sourceCheck = await axios.get(String(tempUrl), {
      responseType: "arraybuffer",
      timeout: 10000,
      maxContentLength: 100 * 1024 * 1024,
    });
    const sourceBytes = Buffer.from(sourceCheck.data);
    const sourceSha256 = await import("crypto").then(({ createHash }) => createHash("sha256").update(sourceBytes).digest("hex"));
    if (sourceBytes.length !== Number(fileSizeBytes)) {
      throw new Error(`tempUrl size mismatch: expected ${fileSizeBytes}, got ${sourceBytes.length}`);
    }
    if (sourceSha256 !== String(sha256).toLowerCase()) {
      throw new Error(`tempUrl sha256 mismatch: expected ${sha256}, got ${sourceSha256}`);
    }

    const controllerCapObject = await env.client.getObject({ id: controllerCap, options: { showType: true } });
    const controllerCapType = String(controllerCapObject?.data?.type || "");
    if (controllerCapType.includes("::oid_identity::ControllerCap")) {
      throw new Error("IOTAcontrollerCap must be the IOTA Identity controller cap, not the OID identity ControllerCap");
    }

    const paymentAmount = BigInt(String(paymentIota || oraclePriceIota || BigInt(credits) * BigInt(env.storageCreditValueIota)));
    const tx = new Transaction();
    const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure(bcsU64(paymentAmount))]);

    tx.moveCall({
      target: `${env.storagePackageID}::oid_storage::create_storage_with_oracle_task`,
      arguments: [
        tx.object(creditToken),
        tx.object(env.storagePolicyID),
        tx.object(controllerCap),
        tx.object(env.oracleTaskRegistryID),
        tx.object(env.oracleStateID),
        tx.object(env.oracleNodeRegistryID),
        paymentCoin,
        tx.pure.string(String(fileName || "")),
        tx.pure.string(String(mimeType || "application/octet-stream")),
        tx.pure.u64(String(fileSizeBytes || 0)),
        tx.pure.string(String(sha256 || "")),
        tx.pure.string(String(tempUrl || "")),
        tx.pure.u64(String(plannedDeletionMs)),
        tx.pure.u64(String(credits)),
        tx.pure.u64(String(priceEurCentsPerCredit || env.storageCreditPriceEurCents)),
        tx.pure.string(String(oracleProfileId || `oracle-template-${templateId}`)),
        tx.pure.u64(String(templateId)),
        tx.pure.string(paymentAmount.toString()),
        tx.pure.string(asJsonStorageString(immutableMetadata)),
        tx.pure.string(asJsonStorageString(mutableMetadata)),
        tx.pure(bcsU64(nodes)),
        tx.pure(bcsU64(quorum)),
        tx.pure(bcsBytes(oraclePayload ?? payloadText)),
        tx.pure(bcsU64(retention)),
        tx.pure(bcsU64(declaredBytes)),
        tx.pure(bcsU8(mediationMode || 0)),
        tx.pure(bcsU64(varianceMax || 0)),
        tx.pure(bcsU8(createResultControllerCap || 0)),
        tx.pure(bcsU64(startMs)),
        tx.pure(bcsU64(endMs)),
        tx.pure(bcsU64(scheduleIntervalMs)),
        tx.object(CLOCK_ID),
      ],
    });

    const txEffect = await executeSponsoredStorageTransaction(
      network,
      env.client,
      env.keyPair,
      tx,
      paymentAmount
    );

    res.json({ success: true, txDigest: txEffect.digest, effects: txEffect.effects, objectChanges: txEffect.objectChanges });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
}

function envStorageCreditValueFallback() {
  return Number(process.env.STORAGE_CREDIT_VALUE_IOTA || "100000000");
}
