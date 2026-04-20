import type { Request, Response } from "express";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { downloadDLVC } from "../utils/IdentityUtils";
import { logInputs } from "./_common";

export default async function download_dlvc(req: Request, res: Response) {
  try {
    const { seed, did, linkedDomain } = req.body;

    logInputs("download_dlvc", { did, linkedDomain });

    if (!seed || typeof seed !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'seed'." });
      return;
    }

    if (!did || typeof did !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'did'." });
      return;
    }

    if (!linkedDomain || typeof linkedDomain !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'linkedDomain'." });
      return;
    }

    const keyPair = Ed25519Keypair.deriveKeypairFromSeed(seed);
    const origin = new URL(linkedDomain).origin;
    const result = await downloadDLVC(did, origin, keyPair);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.status(200).send(JSON.stringify(result.json, null, 2));
  } catch (err) {
    console.error("download_dlvc failed:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}
