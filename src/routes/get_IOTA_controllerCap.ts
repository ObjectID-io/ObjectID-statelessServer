import type { Request, Response } from "express";
import type { IotaObjectData } from "@iota/iota-sdk/client";
import { getObject } from "../utils/getObject";
import { parseDidAliasId } from "../utils/identityNetwork";
import { logInputs, nullSeed, setupEnv } from "./_common";

function normalizeHex(value: unknown): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("0x") ? trimmed.toLowerCase() : `0x${trimmed.toLowerCase()}`;
}

function extractControllerCapFromFields(fields: any): { controllerCap: string; source: string } | null {
  const candidates: Array<{ value: unknown; source: string }> = [
    { value: fields?.controller, source: "controller" },
    { value: fields?.admin_id, source: "admin_id" },
    { value: fields?.controller_cap, source: "controller_cap" },
    { value: fields?.controllerCap, source: "controllerCap" },
    { value: fields?.governance?.fields?.controller, source: "governance.controller" },
    { value: fields?.governance?.fields?.admin_id, source: "governance.admin_id" },
    { value: fields?.governance?.fields?.controller_cap, source: "governance.controller_cap" },
  ];

  for (const candidate of candidates) {
    const normalized = normalizeHex(candidate.value);
    if (normalized) {
      return { controllerCap: normalized, source: candidate.source };
    }
  }

  const controllerEntries = fields?.did_doc?.fields?.controllers?.fields?.contents;
  if (Array.isArray(controllerEntries)) {
    for (let i = 0; i < controllerEntries.length; i += 1) {
      const normalized = normalizeHex(controllerEntries[i]?.fields?.key);
      if (normalized) {
        return { controllerCap: normalized, source: `did_doc.controllers[${i}].key` };
      }
    }
  }

  return null;
}

export default async function get_IOTA_controllerCap(req: Request, res: Response) {
  try {
    const { did, network } = req.body ?? {};

    logInputs("get_IOTA_controllerCap", { did, network });

    if (!did || typeof did !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'did'." });
      return;
    }

    if (!network || typeof network !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'network'." });
      return;
    }

    const identityObjectId = parseDidAliasId(did) || normalizeHex(did);
    if (!identityObjectId) {
      res.status(400).json({ success: false, error: "Unable to derive Identity object id from 'did'." });
      return;
    }

    const { client } = await setupEnv(nullSeed, network);
    const identityObject = (await getObject(client, identityObjectId)) as IotaObjectData | null;

    if (!identityObject || (identityObject.content as any)?.dataType !== "moveObject") {
      res.status(404).json({ success: false, error: "The provided DID does not resolve to a Move object Identity." });
      return;
    }

    const fields = (identityObject.content as any)?.fields ?? {};
    const directMatch = extractControllerCapFromFields(fields);

    if (directMatch) {
      res.json({
        success: true,
        did,
        identityObjectId,
        controllerCap: directMatch.controllerCap,
        source: directMatch.source,
      });
      return;
    }

    const governanceBag = normalizeHex(fields?.governance?.fields?.controller_bag);

    res.status(404).json({
      success: false,
      error: "Unable to find the IOTA ControllerCap in Identity fields.",
      did,
      identityObjectId,
      governanceControllerBag: governanceBag || null,
      fields,
    });
  } catch (err: any) {
    console.error("get_IOTA_controllerCap failed:", err);
    res.status(500).json({
      success: false,
      error: err?.message ?? "Failed to retrieve IOTA ControllerCap.",
    });
  }
}
