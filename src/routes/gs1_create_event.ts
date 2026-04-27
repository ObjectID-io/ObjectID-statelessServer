import type { Request, Response } from "express";
import { logInputs } from "./_common";
import { appendGs1Event } from "../utils/gs1Object";

export default async function gs1_create_event(req: Request, res: Response) {
  try {
    const {
      seed,
      network,
      gs1PackageId,
      gs1RegistryId,
      controllerCap,
      creditToken,
      objectId,
      epcUri,
      gtin,
      serial,
      eventType,
      immutable_metadata,
      mutable_metadata,
    } = req.body;

    logInputs("gs1_create_event", {
      network,
      gs1PackageId,
      gs1RegistryId,
      controllerCap,
      creditToken,
      objectId,
      epcUri,
      gtin,
      serial,
      eventType,
      immutable_metadata,
      mutable_metadata,
    });

    const result = await appendGs1Event({
      seed,
      network,
      gs1PackageId,
      gs1RegistryId,
      controllerCap,
      creditToken,
      objectId,
      epcUri,
      gtin,
      serial,
      eventType,
      immutable: immutable_metadata ?? {},
      mutable: mutable_metadata ?? {},
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: String(error?.message ?? error) });
  }
}
