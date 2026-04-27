import type { Request, Response } from "express";
import { logInputs } from "./_common";
import { ensureGs1Twin } from "../utils/gs1Object";

export default async function gs1_create_resource(req: Request, res: Response) {
  try {
    const { seed, network, gs1PackageId, gs1RegistryId, controllerCap, creditToken, epcUri, immutable, mutablePatch } =
      req.body;

    logInputs("gs1_create_resource", {
      network,
      gs1PackageId,
      gs1RegistryId,
      controllerCap,
      creditToken,
      epcUri,
      immutable,
      mutablePatch,
    });

    const result = await ensureGs1Twin({
      seed,
      network,
      gs1PackageId,
      gs1RegistryId,
      controllerCap,
      creditToken,
      epcUri,
      immutable,
      mutablePatch,
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: String(error?.message ?? error) });
  }
}
