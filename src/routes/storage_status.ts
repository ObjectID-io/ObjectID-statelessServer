import type { Request, Response } from "express";
import { logInputs, nullSeed, setupEnv } from "./_common";
import { parseMoveFields, parseStorageObject } from "../utils/storageMove";

function statusLabel(status: number) {
  if (status === 0) return "Pending oracle";
  if (status === 1) return "Pinned";
  if (status === 2) return "Marked for deletion";
  if (status === 3) return "Deleted";
  return "Unknown";
}

export default async function storage_status(req: Request, res: Response) {
  try {
    const network = String(req.query.network || req.body?.network || "testnet");
    const objectId = String(req.params.objectId || req.query.objectId || req.body?.objectId || "");

    logInputs("storage_status", { network, objectId });

    const env = await setupEnv(nullSeed, network);
    const storageResponse = await env.client.getObject({
      id: objectId,
      options: { showContent: true, showType: true, showOwner: true, showPreviousTransaction: true },
    });
    const storage = parseStorageObject(storageResponse?.data);

    let oracleTask = null;
    if (storage.oracleTaskId) {
      const taskResponse = await env.client.getObject({
        id: storage.oracleTaskId,
        options: { showContent: true, showType: true, showOwner: true },
      });
      const taskFields = parseMoveFields(taskResponse);
      oracleTask = {
        id: storage.oracleTaskId,
        type: taskResponse?.data?.type || "",
        status: Number(taskFields.status || 0),
        fields: taskFields,
        raw: taskResponse?.data || null,
      };
    }

    res.json({
      success: true,
      storage: {
        ...storage,
        statusLabel: statusLabel(storage.status),
      },
      oracleTask,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
}
