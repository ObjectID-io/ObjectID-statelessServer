import type { Request, Response } from "express";
import { resolveGs1ObjectId } from "../utils/gs1Object";
import { logInputs } from "./_common";

export default async function gs1_resolve_iota_id(req: Request, res: Response) {
  try {
    const { seed, network, epcUri, gtin, serial } = req.body;

    logInputs("gs1_resolve_iota_id", {
      network,
      epcUri,
      gtin,
      serial,
    });

    const objectId = await resolveGs1ObjectId({
      seed,
      network,
      epcUri,
      gtin,
      serial,
    });

    res.json({ success: true, objectId });
  } catch (error: any) {
    res.status(500).json({ success: false, error: String(error?.message ?? error) });
  }
}
