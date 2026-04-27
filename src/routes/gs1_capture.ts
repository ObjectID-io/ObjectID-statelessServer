import type { Request, Response } from "express";
import { extractEventList, normalizeEpcisEvent } from "../utils/gs1";
import { appendGs1Event } from "../utils/gs1Object";
import { logInputs } from "./_common";

export default async function gs1_capture(req: Request, res: Response) {
  try {
    const { seed, network, gs1PackageId, gs1RegistryId, controllerCap, creditToken, body, capturedByDid } = req.body;

    logInputs("gs1_capture", {
      network,
      gs1PackageId,
      gs1RegistryId,
      controllerCap,
      creditToken,
      capturedByDid,
    });

    const captureBody = body ?? req.body.capture ?? req.body.document ?? req.body.events ?? req.body.payload;
    const { events, docRef } = extractEventList(captureBody);

    if (!events.length) {
      res.status(400).json({ success: false, error: "no_events_found" });
      return;
    }

    const results: any[] = [];
    for (const event of events) {
      const normalized = normalizeEpcisEvent(event, {
        capturedByDid: capturedByDid ?? req.header("x-captured-by-did") ?? undefined,
        captureSystem: "objectid-statelessserver",
        epcisDocumentRef: docRef,
      });

      const result = await appendGs1Event({
        seed,
        network,
        gs1PackageId,
        gs1RegistryId,
        controllerCap,
        creditToken,
        epcUri: normalized.objectKey.epcUri,
        gtin: normalized.objectKey.gtin,
        serial: normalized.objectKey.serial,
        eventType: normalized.eventType,
        immutable: normalized.eventImmutable,
        mutable: normalized.eventMutable,
      });

      results.push({
        objectId: result.objectId,
        txDigest: result.txDigest,
        eventObjectId: result.eventObjectId,
        eventId: normalized.eventImmutable.event_id,
      });
    }

    res.json({ success: true, captured: results.length, results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: String(error?.message ?? error) });
  }
}
