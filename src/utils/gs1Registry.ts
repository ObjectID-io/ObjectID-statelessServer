import type { IotaClient } from "@iota/iota-sdk/client";

function normalizeObjectId(id: string): string {
  const value = String(id ?? "").trim();
  if (!value) return "";
  return value.startsWith("0x") ? value : `0x${value}`;
}

function extractTableId(registryObject: any, fieldName: "by_gs1" | "by_alt"): string {
  const fields = registryObject?.data?.content?.fields ?? registryObject?.content?.fields ?? {};
  const table = fields[fieldName];
  const id = table?.fields?.id?.id ?? table?.fields?.id?.fields?.id ?? table?.id?.id ?? table?.id ?? "";
  return normalizeObjectId(String(id));
}

async function getRegistryTables(client: IotaClient, registryId: string): Promise<{ byGs1TableId: string; byAltTableId: string }> {
  const registryObject: any = await (client as any).getObject({
    id: registryId,
    options: { showContent: true },
  });

  const byGs1TableId = extractTableId(registryObject, "by_gs1");
  const byAltTableId = extractTableId(registryObject, "by_alt");

  if (!byGs1TableId) {
    throw new Error("Cannot extract by_gs1 table id from GS1Registry");
  }

  return { byGs1TableId, byAltTableId };
}

function extractIdFromTableEntry(entry: any): string | null {
  const value = entry?.data?.content?.fields?.value ?? entry?.content?.fields?.value;
  if (!value) return null;
  if (typeof value === "string") return normalizeObjectId(value);
  if (typeof value?.id === "string") return normalizeObjectId(value.id);
  if (typeof value?.id?.id === "string") return normalizeObjectId(value.id.id);
  if (typeof value?.fields?.id === "string") return normalizeObjectId(value.fields.id);
  if (typeof value?.fields?.id?.id === "string") return normalizeObjectId(value.fields.id.id);
  return null;
}

async function tableGetStringToId(client: IotaClient, tableId: string, key: string): Promise<string | null> {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) return null;

  const rpc: any = client as any;
  const name = { type: "0x1::string::String", value: normalizedKey };

  try {
    if (typeof rpc.getDynamicFieldObject === "function") {
      try {
        const direct = await rpc.getDynamicFieldObject({ parentId: tableId, name });
        const directId = extractIdFromTableEntry(direct);
        if (directId) return directId;
      } catch (error: any) {
        const message = String(error?.message ?? error);
        if (!/invalid\s*params|not\s*found|does\s*not\s*exist|unknown\s*object|dynamic\s*field/i.test(message)) {
          throw error;
        }
      }
    }

    if (typeof rpc.getDynamicFields === "function") {
      let cursor: any = null;
      for (let i = 0; i < 20; i++) {
        const page = await rpc.getDynamicFields({
          parentId: tableId,
          cursor,
          limit: 100,
        });
        const data: any[] = page?.data ?? [];
        const hit = data.find((row) => row?.name?.value === normalizedKey);
        if (hit?.objectId) {
          const object = await rpc.getObject({
            id: hit.objectId,
            options: { showContent: true },
          });
          return extractIdFromTableEntry(object);
        }
        if (!page?.hasNextPage || !page?.nextCursor) break;
        cursor = page.nextCursor;
      }
    }
  } catch (error: any) {
    const message = String(error?.message ?? error);
    if (/not\s*found|does\s*not\s*exist|unknown\s*object|dynamic\s*field/i.test(message)) {
      return null;
    }
    throw error;
  }

  return null;
}

export function makeSgtinAltKey(gtin: string, serial: string): string {
  return `sgtin:${String(gtin ?? "").trim()}.${String(serial ?? "").trim()}`;
}

export async function resolveResourceIdByCanonicalId(
  client: IotaClient,
  registryId: string,
  canonicalId: string
): Promise<string | null> {
  const { byGs1TableId } = await getRegistryTables(client, registryId);
  return tableGetStringToId(client, byGs1TableId, canonicalId);
}

export async function resolveResourceIdByAltKey(client: IotaClient, registryId: string, altKey: string): Promise<string | null> {
  const { byAltTableId } = await getRegistryTables(client, registryId);
  if (!byAltTableId) return null;
  return tableGetStringToId(client, byAltTableId, altKey);
}

export async function resolveResourceIdByKey(
  client: IotaClient,
  registryId: string,
  key: { epcUri?: string; gtin?: string; serial?: string }
): Promise<string | null> {
  if (key.epcUri) {
    const byCanonical = await resolveResourceIdByCanonicalId(client, registryId, key.epcUri);
    if (byCanonical) return byCanonical;
  }

  if (key.gtin && key.serial) {
    return resolveResourceIdByAltKey(client, registryId, makeSgtinAltKey(key.gtin, key.serial));
  }

  return null;
}
