import type { IotaObjectData } from "@iota/iota-sdk/client";

export function normalizeIdentityNetwork(network: string): string {
  return network === "mainnet" ? "iota" : network;
}

export function didFromAliasId(network: string, aliasId: string): string {
  const prefix = network === "testnet" ? "did:iota:testnet:" : "did:iota:";
  return `${prefix}${aliasId}`;
}

export function parseDidAliasId(did: string): string | null {
  const trimmed = String(did ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const last = trimmed.split(":").pop() ?? "";
  if (!last) {
    return null;
  }

  if (last.startsWith("0x") || /^[0-9a-fA-F]+$/.test(last)) {
    return last.startsWith("0x") ? last.toLowerCase() : `0x${last.toLowerCase()}`;
  }

  return null;
}

export function extractControllerRef(data: IotaObjectData | null | undefined): { hex?: string; did?: string } {
  const direct = (data?.content as any)?.fields?.controller_of;
  const nested = (data?.content as any)?.fields?.access_token?.fields?.value?.fields?.controller_of;
  const directDid = (data?.content as any)?.fields?.did ?? (data?.content as any)?.fields?.controller_did;
  const raw = String(direct ?? nested ?? directDid ?? "").trim();

  if (!raw) {
    return {};
  }

  const parsedDid = parseDidAliasId(raw);
  if (parsedDid) {
    return { hex: parsedDid, did: raw.startsWith("did:") ? raw : undefined };
  }

  if (raw.startsWith("did:")) {
    return { did: raw };
  }

  return {};
}
