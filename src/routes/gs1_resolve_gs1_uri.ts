import type { Request, Response } from "express";
import { getGs1UriFromObject } from "../utils/gs1Object";
import { logInputs } from "./_common";

export default async function gs1_resolve_gs1_uri(req: Request, res: Response) {
  try {
    const { seed, network, objectId } = req.body;

    logInputs("gs1_resolve_gs1_uri", {
      network,
      objectId,
    });

    const result = await getGs1UriFromObject({
      seed,
      network,
      objectId,
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: String(error?.message ?? error) });
  }
}
