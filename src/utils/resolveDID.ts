import { getFullnodeUrl, IotaClient } from "@iota/iota-sdk/client";
import { IdentityClientReadOnly, IotaDID, type IotaDocument } from "@iota/identity-wasm/node";
import { norm } from "./utils";

function normalizeNetworkInput(network: unknown, fallback: string): string {
  const lowered = norm(network).toLowerCase();
  if (lowered === "mainnet" || lowered === "testnet") {
    return lowered;
  }
  return fallback;
}

function getNetworkFromDidString(did: string): string {
  const parts = did.trim().split(":");
  if (parts.length >= 4) {
    return parts[2];
  }
  return "mainnet";
}

function getObjectFromDidString(did: string): string {
  const parts = did.trim().split(":");
  return parts[parts.length - 1] ?? "";
}

function toDidString(inputDid: string, networkHint?: string): { didStr: string; network: string } {
  const raw = norm(inputDid);
  if (!raw) {
    throw new Error("DID is empty");
  }

  if (raw.startsWith("0x")) {
    const network = normalizeNetworkInput(networkHint, "mainnet");
    const prefix = network === "testnet" ? "did:iota:testnet:" : "did:iota:";
    return { didStr: `${prefix}${raw}`, network };
  }

  const network = normalizeNetworkInput(getNetworkFromDidString(raw), normalizeNetworkInput(networkHint, "mainnet"));
  return { didStr: raw, network };
}

export async function resolveDID(inputDid: IotaDID | string, networkHint?: string): Promise<IotaDocument | undefined> {
  try {
    let did: IotaDID;
    let network: string;

    if (typeof inputDid === "string") {
      const normalized = toDidString(inputDid, networkHint);
      network = normalized.network;
      did = IotaDID.fromAliasId(getObjectFromDidString(normalized.didStr), network === "testnet" ? "testnet" : "iota");
    } else {
      did = inputDid;
      network = normalizeNetworkInput(networkHint, "mainnet");
    }

    const client = new IotaClient({ url: getFullnodeUrl(network as "mainnet" | "testnet") });
    const readOnly = await IdentityClientReadOnly.create(client);
    return await readOnly.resolveDid(did);
  } catch {
    return undefined;
  }
}

