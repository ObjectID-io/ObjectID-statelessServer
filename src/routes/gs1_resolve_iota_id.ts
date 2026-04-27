import type { Request, Response } from "express";
import { resolveGs1ObjectId } from "../utils/gs1Object";
import { logInputs } from "./_common";

export default async function gs1_resolve_iota_id(req: Request, res: Response) {
  try {
    const { seed, network, gs1PackageId, gs1RegistryId, epcUri, gtin, serial } = req.body;

    logInputs("gs1_resolve_iota_id", {
      network,
      gs1PackageId,
      gs1RegistryId,
      epcUri,
      gtin,
      serial,
    });

    const objectId = await resolveGs1ObjectId({
      seed,
      network,
      gs1PackageId,
      gs1RegistryId,
      epcUri,
      gtin,
      serial,
    });

    res.json({ success: true, objectId });
  } catch (error: any) {
    res.status(500).json({ success: false, error: String(error?.message ?? error) });
  }
}
