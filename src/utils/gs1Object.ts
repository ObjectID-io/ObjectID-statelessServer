import type { ExecutionStatus, IotaClient } from "@iota/iota-sdk/client";
import { Transaction } from "@iota/iota-sdk/transactions";
import { getObject } from "./getObject";
import { parseEpcUrn } from "./gs1";
import { resolveResourceIdByCanonicalId, resolveResourceIdByKey } from "./gs1Registry";
import { setupEnv, useGasStation } from "../routes/_common";
import { singAndExecTx } from "./signAndExecTx";

type Gs1ConfigInput = {
  seed: string;
  network: string;
  gs1PackageId?: string;
  gs1RegistryId?: string;
  controllerCap?: string;
  creditToken?: string;
};

type Gs1ExecutionEnv = {
  network: string;
  client: IotaClient;
  keyPair: any;
  gasStation: any;
  policy: string;
  gs1PackageId: string;
  gs1RegistryId: string;
  controllerCap: string;
  creditToken: string;
  gs1ModuleName: string;
};

export type EnsureGs1TwinInput = Gs1ConfigInput & {
  epcUri: string;
  immutable?: Record<string, any>;
  mutablePatch?: Record<string, any>;
};

export type AppendGs1EventInput = Gs1ConfigInput & {
  objectId?: string;
  epcUri?: string;
  gtin?: string;
  serial?: string;
  eventType:
    | "epcis_object_event"
    | "epcis_aggregation_event"
    | "epcis_transformation_event"
    | "epcis_association_event";
  immutable: Record<string, any>;
  mutable: Record<string, any>;
};

function normalizeObjectId(value: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return normalized.startsWith("0x") ? normalized : `0x${normalized}`;
}

function safeString(value: any): string {
  return String(value ?? "").trim();
}

function toMillis(value: any): bigint {
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  const asString = safeString(value);
  if (!asString) return BigInt(Date.now());
  const asNumber = Number(asString);
  if (Number.isFinite(asNumber) && asNumber > 0) return BigInt(Math.trunc(asNumber));
  const asDate = Date.parse(asString);
  if (Number.isFinite(asDate)) return BigInt(asDate);
  return BigInt(Date.now());
}

function asStringValue(value: any): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractGs1ModuleNameFromType(type: string): string {
  const match = String(type ?? "").trim().match(/::([A-Za-z0-9_]+)::GS1Registry\b/);
  return match?.[1] ?? "gs1_registry";
}

async function setupGs1Env(input: Gs1ConfigInput): Promise<Gs1ExecutionEnv> {
  const env = await setupEnv(input.seed, input.network);

  const gs1PackageId = normalizeObjectId(input.gs1PackageId ?? process.env.OID_GS1_PACKAGE_ID ?? "");
  const gs1RegistryId = normalizeObjectId(input.gs1RegistryId ?? process.env.OID_GS1_REGISTRY_ID ?? "");
  const controllerCap = normalizeObjectId(
    input.controllerCap ?? process.env.OID_CONTROLLER_CAP_ID ?? process.env.OIDcontrollerCap ?? ""
  );
  const creditToken = normalizeObjectId(
    input.creditToken ?? process.env.OID_CREDIT_TOKEN_ID ?? process.env.creditToken ?? ""
  );

  if (!gs1PackageId) throw new Error("Missing gs1PackageId or OID_GS1_PACKAGE_ID");
  if (!gs1RegistryId) throw new Error("Missing gs1RegistryId or OID_GS1_REGISTRY_ID");
  if (!controllerCap) throw new Error("Missing controllerCap or OID_CONTROLLER_CAP_ID");
  if (!creditToken) throw new Error("Missing creditToken or OID_CREDIT_TOKEN_ID");

  const registryObject: any = await env.client.getObject({
    id: gs1RegistryId,
    options: { showType: true },
  });
  const type = String(registryObject?.data?.type ?? registryObject?.data?.content?.type ?? "");

  return {
    network: input.network,
    client: env.client,
    keyPair: env.keyPair,
    gasStation: env.gasStation,
    policy: env.policy,
    gs1PackageId,
    gs1RegistryId,
    controllerCap,
    creditToken,
    gs1ModuleName: extractGs1ModuleNameFromType(type),
  };
}

function readExecutionStatus(effects: any): ExecutionStatus | undefined {
  return (effects?.status ?? effects?.effects?.status) as ExecutionStatus | undefined;
}

function listCreatedIds(effects: any): string[] {
  const created = effects?.created ?? effects?.effects?.created ?? [];
  const ids: string[] = [];
  for (const row of created) {
    const objectId = row?.reference?.objectId ?? row?.reference?.object_id ?? row?.reference?.objectID ?? row?.objectId;
    if (objectId) ids.push(String(objectId));
  }
  return ids;
}

async function signAndExecute(env: Gs1ExecutionEnv, tx: Transaction): Promise<{ digest: string; effects: any }> {
  tx.setGasBudget(10_000_000);
  tx.setSender(env.keyPair.toIotaAddress());

  return new Promise((resolve, reject) => {
    void singAndExecTx(env.network, env.client, env.gasStation, useGasStation, env.keyPair, tx, {
      onSuccess: (result) => resolve({ digest: String(result.digest ?? ""), effects: result.effects }),
      onError: (error) => reject(error),
      onSettled: () => {},
    });
  });
}

function makeStringVec(tx: Transaction, values: string[]) {
  const elements = (values ?? []).map((value) => tx.pure.string(String(value ?? "")));
  return (tx as any).makeMoveVec({ type: "0x1::string::String", elements });
}

async function pickCreatedObjectIdByType(env: Gs1ExecutionEnv, suffix: string, effects: any): Promise<string | null> {
  const ids = listCreatedIds(effects);
  for (const id of ids) {
    try {
      const object: any = await env.client.getObject({ id, options: { showType: true } });
      const type = String(object?.data?.type ?? object?.data?.content?.type ?? "");
      if (type.endsWith(suffix)) return id;
    } catch {
      // best effort lookup only
    }
  }
  return ids.length ? ids[0] : null;
}

function buildExtensionVectors(immutable: Record<string, any>): { keys: string[]; values: string[] } {
  const known = new Set([
    "canonical_id",
    "id_level",
    "primary_key_type",
    "gtin",
    "serial",
    "serial_number",
    "lot",
    "lot_number",
    "expiry_date",
    "brand_owner_gln",
    "manufacturing_location_gln",
    "digital_link_uri",
    "epc_uri",
    "epcUri",
    "data_carrier",
    "dataCarrier",
  ]);

  const keys: string[] = [];
  const values: string[] = [];
  for (const [key, value] of Object.entries(immutable ?? {})) {
    if (known.has(key)) continue;
    keys.push(String(key));
    values.push(asStringValue(value));
  }
  return { keys, values };
}

function getEventTypeString(
  eventType: AppendGs1EventInput["eventType"]
): "ObjectEvent" | "AggregationEvent" | "TransformationEvent" | "AssociationEvent" {
  if (eventType === "epcis_object_event") return "ObjectEvent";
  if (eventType === "epcis_aggregation_event") return "AggregationEvent";
  if (eventType === "epcis_transformation_event") return "TransformationEvent";
  return "AssociationEvent";
}

export async function ensureGs1Twin(input: EnsureGs1TwinInput): Promise<{
  objectId: string;
  alreadyRegistered: boolean;
  key: { epcUri: string; gtin?: string; serial?: string };
}> {
  const env = await setupGs1Env(input);
  const epcUri = safeString(input.epcUri);
  if (!epcUri) throw new Error("Missing epcUri");

  const existing = await resolveResourceIdByCanonicalId(env.client, env.gs1RegistryId, epcUri);
  const parsed = parseEpcUrn(epcUri);
  const gtin = parsed.scheme === "sgtin" ? parsed.gtin14 : undefined;
  const serial = parsed.scheme === "sgtin" ? parsed.serial : undefined;
  const key = { epcUri, gtin, serial };

  if (existing) {
    return { objectId: existing, alreadyRegistered: true, key };
  }

  const immutable: Record<string, any> = {
    gtin: gtin ?? "",
    serial_number: serial ?? "",
    lot_number: "",
    expiry_date: "",
    brand_owner_gln: "",
    manufacturing_location_gln: "",
    digital_link_uri: "",
    epc_uri: epcUri,
    data_carrier: "",
    ...(input.immutable ?? {}),
  };

  const canonicalId = safeString(immutable.canonical_id ?? epcUri);
  const lot = safeString(immutable.lot_number ?? immutable.lot ?? "");
  const expiry = safeString(immutable.expiry_date ?? immutable.expiry ?? "");
  const brandOwnerGln = safeString(immutable.brand_owner_gln ?? "");
  const manufacturingLocationGln = safeString(immutable.manufacturing_location_gln ?? "");
  const digitalLinkUri = safeString(immutable.digital_link_uri ?? "");
  const dataCarrier = safeString(immutable.data_carrier ?? immutable.dataCarrier ?? "");

  const idLevel = serial ? 1 : gtin ? 0 : 0;
  let primaryKeyType = 0;
  if (parsed.scheme === "sgtin") primaryKeyType = 2;
  else if (gtin) primaryKeyType = 1;
  else if (parsed.scheme === "sscc") primaryKeyType = 3;
  else if (parsed.scheme === "sgln") primaryKeyType = 4;

  const { keys, values } = buildExtensionVectors(immutable);

  const tx = new Transaction();
  tx.moveCall({
    target: `${env.gs1PackageId}::${env.gs1ModuleName}::create_resource_registered`,
    arguments: [
      tx.object(env.gs1RegistryId),
      tx.object(env.creditToken),
      tx.object(env.policy),
      tx.object(env.controllerCap),
      tx.pure.string(canonicalId),
      tx.pure.u8(idLevel),
      tx.pure.u8(primaryKeyType),
      tx.pure.string(safeString(immutable.gtin ?? gtin ?? "")),
      tx.pure.string(safeString(immutable.serial_number ?? immutable.serial ?? serial ?? "")),
      tx.pure.string(lot),
      tx.pure.string(expiry),
      tx.pure.string(brandOwnerGln),
      tx.pure.string(manufacturingLocationGln),
      tx.pure.string(digitalLinkUri),
      tx.pure.string(epcUri),
      tx.pure.string(dataCarrier),
      makeStringVec(tx, keys),
      makeStringVec(tx, values),
      tx.object("0x6"),
    ],
  });

  const { effects } = await signAndExecute(env, tx);
  const status = readExecutionStatus(effects);
  if (status && status.status !== "success") {
    throw new Error(String((status as any).error ?? "Transaction failed"));
  }

  const objectId = await pickCreatedObjectIdByType(env, `::${env.gs1ModuleName}::GS1Resource`, effects);
  if (!objectId) throw new Error("GS1Resource created but objectId not found in tx effects");

  return { objectId, alreadyRegistered: false, key };
}

export async function appendGs1Event(input: AppendGs1EventInput): Promise<{
  objectId: string;
  txDigest: string;
  eventObjectId: string | null;
}> {
  const env = await setupGs1Env(input);
  const objectId =
    normalizeObjectId(input.objectId ?? "") ||
    normalizeObjectId(
      (await resolveResourceIdByKey(env.client, env.gs1RegistryId, {
        epcUri: input.epcUri,
        gtin: input.gtin,
        serial: input.serial,
      })) ?? ""
    );

  if (!objectId) throw new Error("Missing objectId and unable to resolve GS1 key");

  const payload = JSON.stringify({
    eventType: input.eventType,
    immutable: input.immutable,
    mutable: input.mutable,
  });

  const tx = new Transaction();
  tx.moveCall({
    target: `${env.gs1PackageId}::${env.gs1ModuleName}::append_event`,
    arguments: [
      tx.object(env.creditToken),
      tx.object(env.policy),
      tx.object(env.controllerCap),
      tx.object(objectId),
      tx.pure.u64(toMillis(input.immutable?.event_time ?? input.immutable?.eventTime)),
      tx.pure.string(safeString(input.immutable?.event_id ?? input.immutable?.eventId ?? "")),
      tx.pure.string(getEventTypeString(input.eventType)),
      tx.pure.string(safeString(input.immutable?.action ?? "OBSERVE")),
      tx.pure.string(safeString(input.immutable?.biz_step_uri ?? input.immutable?.bizStep ?? "")),
      tx.pure.string(safeString(input.immutable?.disposition_uri ?? input.immutable?.disposition ?? "")),
      tx.pure.string(safeString(input.immutable?.read_point_gln ?? "")),
      tx.pure.string(safeString(input.immutable?.biz_location_gln ?? "")),
      tx.pure.string(safeString(input.immutable?.parent_sscc ?? input.immutable?.parent_id ?? "")),
      tx.pure.string(payload),
      tx.object("0x6"),
    ],
  });

  const { digest, effects } = await signAndExecute(env, tx);
  const status = readExecutionStatus(effects);
  if (status && status.status !== "success") {
    throw new Error(String((status as any).error ?? "Transaction failed"));
  }

  const eventObjectId = await pickCreatedObjectIdByType(env, `::${env.gs1ModuleName}::GS1Event`, effects);
  return { objectId, txDigest: digest, eventObjectId };
}

export async function resolveGs1ObjectId(input: Gs1ConfigInput & { epcUri?: string; gtin?: string; serial?: string }) {
  const env = await setupGs1Env(input);
  return resolveResourceIdByKey(env.client, env.gs1RegistryId, {
    epcUri: input.epcUri,
    gtin: input.gtin,
    serial: input.serial,
  });
}

export async function getGs1ObjectData(input: Gs1ConfigInput & { objectId?: string; epcUri?: string; gtin?: string; serial?: string }) {
  const env = await setupGs1Env(input);
  const objectId =
    normalizeObjectId(input.objectId ?? "") ||
    normalizeObjectId(
      (await resolveResourceIdByKey(env.client, env.gs1RegistryId, {
        epcUri: input.epcUri,
        gtin: input.gtin,
        serial: input.serial,
      })) ?? ""
    );

  if (!objectId) throw new Error("Object not found");

  const objectData = await getObject(env.client, objectId);
  const gs1Uri = extractGs1UriFromObjectData(objectData);
  return { objectId, gs1Uri, objectData };
}

export async function getGs1UriFromObject(input: Gs1ConfigInput & { objectId: string }) {
  const env = await setupGs1Env(input);
  const objectData = await getObject(env.client, normalizeObjectId(input.objectId));
  return {
    objectId: normalizeObjectId(input.objectId),
    gs1Uri: extractGs1UriFromObjectData(objectData),
    objectData,
  };
}

export async function getGs1EventsForResource(input: Gs1ConfigInput & { objectId?: string; epcUri?: string; gtin?: string; serial?: string }) {
  const env = await setupGs1Env(input);
  const objectId =
    normalizeObjectId(input.objectId ?? "") ||
    normalizeObjectId(
      (await resolveResourceIdByKey(env.client, env.gs1RegistryId, {
        epcUri: input.epcUri,
        gtin: input.gtin,
        serial: input.serial,
      })) ?? ""
    );

  if (!objectId) throw new Error("Object not found");

  const owned: any = await env.client.getOwnedObjects({
    owner: objectId,
    limit: 100,
    options: { showType: true },
  } as any);

  const rows: any[] = owned?.data ?? owned?.objects ?? [];
  const suffix = `::${env.gs1ModuleName}::GS1Event`;
  const eventObjectIds = rows
    .map((row) => ({
      id: row?.data?.objectId ?? row?.data?.object_id ?? row?.node?.address ?? row?.address ?? row?.objectId ?? "",
      type:
        row?.data?.type ??
        row?.data?.type?.repr ??
        row?.data?.content?.type ??
        row?.data?.content?.type?.repr ??
        row?.node?.asMoveObject?.contents?.type?.repr ??
        "",
    }))
    .filter((row) => row.id && String(row.type).includes(suffix))
    .map((row) => String(row.id));

  return {
    objectId,
    eventObjectIds: Array.from(new Set(eventObjectIds)),
  };
}

export function extractGs1UriFromObjectData(objectData: any): string | null {
  const fields = objectData?.content?.fields ?? objectData?.fields ?? {};
  const epcUri = safeString(fields.epc_uri ?? fields.epcUri ?? "");
  if (epcUri) return epcUri;
  const canonicalId = safeString(fields.canonical_id ?? "");
  return canonicalId || null;
}
