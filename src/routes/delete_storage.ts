import type { Request, Response } from "express";
import { Transaction } from "@iota/iota-sdk/transactions";
import { logInputs, setupEnv, useGasStation } from "./_common";
import { DEFAULT_STORAGE_GAS_BUDGET, executeStorageTx, parseMoveFields } from "../utils/storageMove";

export default async function delete_storage(req: Request, res: Response) {
  try {
    const { seed, network, OIDcontrollerCap, IOTAcontrollerCap, identityControllerCap, objectId, oracleTaskId, deleteOracleTask = true } = req.body;
    const controllerCap = IOTAcontrollerCap || identityControllerCap || OIDcontrollerCap;

    logInputs("delete_storage", {
      network,
      IOTAcontrollerCap: controllerCap,
      objectId,
      oracleTaskId,
      deleteOracleTask,
    });

    const env = await setupEnv(seed, network);
    if (!controllerCap) throw new Error("IOTAcontrollerCap is required");

    const controllerCapObject = await env.client.getObject({ id: controllerCap, options: { showType: true } });
    const controllerCapType = String(controllerCapObject?.data?.type || "");
    if (controllerCapType.includes("::oid_identity::ControllerCap")) {
      throw new Error("IOTAcontrollerCap must be the IOTA Identity controller cap, not the OID identity ControllerCap");
    }

    const digests: string[] = [];

    if (deleteOracleTask && oracleTaskId) {
      const task = await env.client.getObject({
        id: oracleTaskId,
        options: { showContent: true, showType: true },
      });
      const taskStatus = Number(parseMoveFields(task).status || 0);

      if (taskStatus !== 2 && taskStatus !== 11) {
        const suspendTx = new Transaction();
        suspendTx.moveCall({
          target: `${env.oracleTasksPackageID}::oracle_tasks::suspend_task_by_owner`,
          arguments: [suspendTx.object(env.oracleTaskRegistryID), suspendTx.object(oracleTaskId)],
        });
        const suspendEffect = await executeStorageTx(
          network,
          env.client,
          env.gasStation,
          useGasStation,
          env.keyPair,
          suspendTx,
          DEFAULT_STORAGE_GAS_BUDGET
        );
        digests.push(suspendEffect.digest);
      }
    }

    const tx = new Transaction();
    if (deleteOracleTask && oracleTaskId) {
      tx.moveCall({
        target: `${env.oracleTasksPackageID}::oracle_tasks::delete_task_by_owner`,
        arguments: [tx.object(env.oracleTaskRegistryID), tx.object(oracleTaskId)],
      });
    }
    tx.moveCall({
      target: `${env.storagePackageID}::oid_storage::delete_storage`,
      arguments: [tx.object(controllerCap), tx.object(objectId)],
    });

    const txEffect = await executeStorageTx(
      network,
      env.client,
      env.gasStation,
      useGasStation,
      env.keyPair,
      tx,
      DEFAULT_STORAGE_GAS_BUDGET
    );
    digests.push(txEffect.digest);

    res.json({ success: true, txDigest: txEffect.digest, digests, effects: txEffect.effects, objectChanges: txEffect.objectChanges });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
}
