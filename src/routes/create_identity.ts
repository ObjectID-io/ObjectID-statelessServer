import type { Request, Response } from "express";
import { createIdentityForKeyPair } from "../utils/IdentityUtils";
import { logInputs, setupEnv } from "./_common";

export default async function create_identity(req: Request, res: Response) {
  try {
    const { seed, network } = req.body;

    logInputs("create_identity", { network });

    if (!seed || typeof seed !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'seed'." });
      return;
    }

    if (!network || typeof network !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'network'." });
      return;
    }

    const { client, keyPair, gasStation } = await setupEnv(seed, network);
    const result = await createIdentityForKeyPair(client, network, keyPair, gasStation);
    const txDigest = result.transactionEffects?.transactionDigest || null;

    res.json({
      success: true,
      did: result.did,
      controllerCap: result.controllerCap ?? null,
      txDigest,
      effects: result.transactionEffects ?? null,
    });
  } catch (err) {
    console.error("create_identity failed:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}
