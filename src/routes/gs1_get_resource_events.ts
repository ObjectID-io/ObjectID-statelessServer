import type { Request, Response } from "express";
import { getGs1EventsForResource } from "../utils/gs1Object";
import { logInputs } from "./_common";

export default async function gs1_get_resource_events(req: Request, res: Response) {
  try {
    const { seed, network, gs1PackageId, gs1RegistryId, objectId, epcUri, gtin, serial } = req.body;

    logInputs("gs1_get_resource_events", {
      network,
      gs1PackageId,
      gs1RegistryId,
      objectId,
      epcUri,
      gtin,
      serial,
    });

    const result = await getGs1EventsForResource({
      seed,
      network,
      gs1PackageId,
      gs1RegistryId,
      objectId,
      epcUri,
      gtin,
      serial,
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: String(error?.message ?? error) });
  }
}
