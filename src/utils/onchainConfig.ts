import { getFullnodeUrl, IotaClient } from "@iota/iota-sdk/client";

export type ObjectIdNetwork = "testnet" | "mainnet";

export type LoadedOnChainConfig = {
  source: "user" | "default";
  objectId: string;
  json: Record<string, any>;
};

export const DEFAULT_CONFIG_PACKAGE_IDS: Record<ObjectIdNetwork, string> = {
  testnet: "0x7560b5cb2024a3a712ed1e09f4e42ba806b886a44262c9d40ac31fbcfeb30cc0",
  mainnet: "0x6148d3674590634d59f8f972d71dd6148e014dd9c036c048d446853dd80049f4",
};

export const DEFAULT_SHARED_CONFIG_OBJECT_ID: Record<ObjectIdNetwork, string> = {
  testnet: "0xf9d3f786ac5ee53f293b87f6800eee852d6e7263d78275377f5d13db04f4be15",
  mainnet: "0x3351d3692783c1b569d6ebe8b0ede46dec51e5688b2892d20b32c0a94414043d",
};

const cache = new Map<string, { expiresAt: number; value: LoadedOnChainConfig }>();

export function normalizeObjectIdNetwork(network: string): ObjectIdNetwork {
  const n = String(network ?? "")
    .trim()
    .toLowerCase();
  return n === "mainnet" || n === "iota" ? "mainnet" : "testnet";
}

export function normalizeHex(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.startsWith("0x") ? raw.toLowerCase() : `0x${raw.toLowerCase()}`;
}

export function configType(packageId: string): string {
  return `${normalizeHex(packageId)}::oid_config::Config`;
}

function defaultConfigPackageId(network: ObjectIdNetwork): string {
  const envValue =
    network === "testnet"
      ? process.env.TESTNET_OID_CONFIG_PACKAGE_ID || process.env.OID_CONFIG_PACKAGE_ID_TESTNET
      : process.env.MAINNET_OID_CONFIG_PACKAGE_ID || process.env.OID_CONFIG_PACKAGE_ID_MAINNET;
  return normalizeHex(envValue || DEFAULT_CONFIG_PACKAGE_IDS[network]);
}

function defaultSharedConfigObjectId(network: ObjectIdNetwork): string {
  const envValue =
    network === "testnet"
      ? process.env.TESTNET_OID_CONFIG_OBJECT_ID || process.env.OID_CONFIG_OBJECT_ID_TESTNET
      : process.env.MAINNET_OID_CONFIG_OBJECT_ID || process.env.OID_CONFIG_OBJECT_ID_MAINNET;
  return normalizeHex(envValue || DEFAULT_SHARED_CONFIG_OBJECT_ID[network]);
}

function decodeJsonBytes(bytes: unknown): Record<string, any> {
  if (!Array.isArray(bytes)) {
    throw new Error("Expected on-chain Config.json to be vector<u8>.");
  }

  if (bytes.length === 0) return {};

  const u8 = new Uint8Array(bytes.map((n) => Number(n)));
  const text = new TextDecoder().decode(u8).trim();
  return text ? JSON.parse(text) : {};
}

function getMoveFields(response: any): Record<string, any> | null {
  return (
    response?.data?.content?.fields ??
    response?.data?.content?.data?.fields ??
    response?.content?.fields ??
    response?.content?.data?.fields ??
    null
  );
}

export async function getObjectConfigJson(client: IotaClient, objectId: string): Promise<Record<string, any>> {
  const response = await client.getObject({
    id: normalizeHex(objectId),
    options: { showContent: true, showType: true },
  });

  const fields = getMoveFields(response);
  if (!fields) {
    throw new Error(`Config object ${objectId} has no Move fields/content.`);
  }

  return decodeJsonBytes(fields.json);
}

export async function findUserConfigObjectId(client: IotaClient, owner: string, configPackageId: string): Promise<string | null> {
  const response = await client.getOwnedObjects({
    owner: normalizeHex(owner),
    filter: { StructType: configType(configPackageId) },
    options: { showType: true, showContent: false },
    limit: 10,
  });

  const data = response?.data ?? [];
  if (!data.length) return null;

  data.sort((a: any, b: any) => Number(b?.data?.version ?? b?.version ?? 0) - Number(a?.data?.version ?? a?.version ?? 0));
  const objectId = (data[0] as any)?.data?.objectId ?? (data[0] as any)?.objectId ?? null;
  return objectId ? String(objectId) : null;
}

export async function loadPublicOnChainConfig(network: string, client?: IotaClient): Promise<LoadedOnChainConfig> {
  const net = normalizeObjectIdNetwork(network);
  const objectId = defaultSharedConfigObjectId(net);
  const rpcClient = client ?? new IotaClient({ url: getFullnodeUrl(net) });
  const json = await getObjectConfigJson(rpcClient, objectId);
  return { source: "default", objectId, json };
}

export async function loadEffectiveOnChainConfig(
  network: string,
  client: IotaClient,
  ownerAddress?: string,
): Promise<LoadedOnChainConfig> {
  const net = normalizeObjectIdNetwork(network);
  const cacheKey = `${net}:${ownerAddress ? normalizeHex(ownerAddress) : "default"}`;
  const ttlMs = Number(process.env.OID_CONFIG_CACHE_TTL_MS || "60000");
  const cached = cache.get(cacheKey);

  if (process.env.OID_CONFIG_DISABLE_CACHE !== "true" && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const configPackageId = defaultConfigPackageId(net);
  const userConfigId = ownerAddress ? await findUserConfigObjectId(client, ownerAddress, configPackageId) : null;
  const value = userConfigId
    ? { source: "user" as const, objectId: userConfigId, json: await getObjectConfigJson(client, userConfigId) }
    : await loadPublicOnChainConfig(net, client);

  if (process.env.OID_CONFIG_DISABLE_CACHE !== "true" && ttlMs > 0) {
    cache.set(cacheKey, { expiresAt: Date.now() + ttlMs, value });
  }

  return value;
}
