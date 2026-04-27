import type { Request, Response } from "express";
import { getGs1UriFromObject } from "../utils/gs1Object";
import { logInputs } from "./_common";

export default async function gs1_resolve_gs1_uri(req: Request, res: Response) {
  try {
    const { seed, network, gs1PackageId, gs1RegistryId, objectId } = req.body;

    logInputs("gs1_resolve_gs1_uri", {
      network,
      gs1PackageId,
      gs1RegistryId,
      objectId,
    });

    const result = await getGs1UriFromObject({
      seed,
      network,
      gs1PackageId,
      gs1RegistryId,
      objectId,
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: String(error?.message ?? error) });
  }
}
