import type { Request, Response } from "express";
import { linkDomain } from "../utils/IdentityUtils";
import { logInputs, setupEnv } from "./_common";
import { normalizeLinkedDomain } from "../utils/utils";

export default async function link_identity(req: Request, res: Response) {
  try {
    const { seed, network, did, domain } = req.body;

    logInputs("link_identity", { network, did, domain });

    if (!seed || typeof seed !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'seed'." });
      return;
    }

    if (!network || typeof network !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'network'." });
      return;
    }

    if (!did || typeof did !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'did'." });
      return;
    }

    if (!domain || typeof domain !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'domain'." });
      return;
    }

    const { client, keyPair, gasStation } = await setupEnv(seed, network);
    const normalizedDomain = normalizeLinkedDomain(domain);
    const result = await linkDomain(client, did, normalizedDomain, keyPair, gasStation);
    const txDigest = result?.transactionEffects?.transactionDigest || null;

    res.json({
      success: true,
      did: result?.did ?? did,
      controllerCap: result?.controllerCap ?? null,
      proposalId: result?.proposalId ?? null,
      proposalTxDigest: result?.proposalEffects?.transactionDigest ?? null,
      linkedDomain: normalizedDomain,
      txDigest,
      effects: result?.transactionEffects ?? null,
    });
  } catch (err) {
    console.error("link_identity failed:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}
