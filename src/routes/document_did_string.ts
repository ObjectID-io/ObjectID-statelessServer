import type { Request, Response } from "express";
import { logInputs } from "./_common";

/**
 * Off-chain helper that mirrors the on-chain prefix used in the Move module:
 * "did:iota:0x" + <hex without leading 0x>.
 */
export default async function document_did_string(req: Request, res: Response) {
  try {
    const { id } = req.body as { id: string };

    logInputs("document_did_string", { id });

    const raw = String(id || "").trim();
    const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
    const did = "did:iota:0x" + hex.toLowerCase();

    res.json({ success: true, did });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.json({ success: false, error: String(err) });
  }
}
