import { bcs } from "@iota/iota-sdk/bcs";
import { IotaClient, IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Transaction } from "@iota/iota-sdk/transactions";
import axios from "axios";
import type { gasStationCfg } from "./signAndExecTx";
import { singAndExecTx } from "./signAndExecTx";

export const CLOCK_ID = "0x6";
export const DEFAULT_STORAGE_GAS_BUDGET = 50_000_000;

export function bcsU64(value: unknown) {
  return bcs.u64().serialize(BigInt(String(value || 0))).toBytes();
}

export function bcsU8(value: unknown) {
  return bcs.u8().serialize(Number(value || 0)).toBytes();
}

export function bcsBytes(value: unknown) {
  if (Array.isArray(value)) {
    return bcs.vector(bcs.u8()).serialize(value.map((item) => Number(item) & 0xff)).toBytes();
  }
  if (value && typeof value === "object") {
    const anyValue = value as any;
    const nested = anyValue.bytes ?? anyValue.data ?? anyValue.fields?.bytes ?? anyValue.fields?.data;
    if (Array.isArray(nested)) {
      return bcs.vector(bcs.u8()).serialize(nested.map((item) => Number(item) & 0xff)).toBytes();
    }
  }

  const text = typeof value === "string" ? value : JSON.stringify(value || {});
  return bcs.vector(bcs.u8()).serialize(Array.from(Buffer.from(text, "utf8"))).toBytes();
}

export function asJsonStorageString(value: unknown) {
  if (value === undefined || value === null) return "{}";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function asPositiveInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export function storageGasBudget(paymentIota: bigint | number | string) {
  const payment = BigInt(String(paymentIota || 0));
  return Number(payment + BigInt(DEFAULT_STORAGE_GAS_BUDGET));
}

function bytesToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string) {
  return Uint8Array.from(Buffer.from(String(value || ""), "base64"));
}

export function parseMoveFields(obj: any) {
  return obj?.content?.fields || obj?.data?.content?.fields || obj?.data?.content?.data?.fields || {};
}

export function moveValueToString(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "object") return moveValueToString(value.fields?.value ?? value.value ?? value.id ?? value.fields);
  return "";
}

function parseJsonString(raw: unknown) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseStorageObject(obj: any) {
  const fields = parseMoveFields(obj);
  const immutableMetadataJson = parseJsonString(fields.immutable_metadata);
  const mutableMetadataJson = parseJsonString(fields.mutable_metadata);

  return {
    id: obj?.objectId || obj?.data?.objectId || obj?.id || "",
    type: obj?.type || obj?.data?.type || "",
    creatorDid: String(fields.creator_did || ""),
    ownerDid: String(fields.owner_did || ""),
    fileName: String(fields.file_name || ""),
    mimeType: String(fields.mime_type || ""),
    fileSizeBytes: Number(fields.file_size_bytes || 0),
    creditsBurned: Number(fields.credits_burned || 0),
    oracleProfileId: String(fields.oracle_profile_id || ""),
    oracleTemplateId: Number(fields.oracle_template_id || 0),
    oraclePriceIota: String(fields.oracle_price_iota || "0"),
    oracleTaskId: String(fields.oracle_task_id || ""),
    sha256: String(fields.sha256 || ""),
    tempUrl: String(fields.temp_url || ""),
    ipfsCid: String(fields.ipfs_cid || ""),
    ipfsGatewayUrl: String(fields.ipfs_gateway_url || ""),
    uploadedAtMs: Number(fields.uploaded_at_ms || 0),
    plannedDeletionAtMs: Number(fields.planned_deletion_at_ms || 0),
    deletedAtMs: Number(fields.deleted_at_ms || 0),
    priceEurCentsPerCredit: Number(fields.price_eur_cents_per_credit || 0),
    status: Number(fields.status || 0),
    immutableMetadata: String(fields.immutable_metadata || ""),
    mutableMetadata: String(fields.mutable_metadata || ""),
    immutableMetadataJson,
    mutableMetadataJson,
    fields,
    raw: obj,
  };
}

export async function executeStorageTx(
  network: string,
  client: IotaClient,
  gasStation: gasStationCfg,
  useGasStation: boolean,
  keyPair: Ed25519Keypair,
  tx: Transaction,
  gasBudget: number
): Promise<IotaTransactionBlockResponse> {
  const result = await singAndExecTx(
    network,
    client,
    gasStation,
    useGasStation,
    keyPair,
    tx,
    {
      onSuccess: () => {},
      onError: (err) => {
        throw err;
      },
      onSettled: () => {},
    },
    gasBudget
  );

  if (!result?.success || !result.tx_effect) throw new Error("Storage transaction failed");
  return result.tx_effect;
}

export async function executeSponsoredStorageTransaction(
  network: string,
  client: IotaClient,
  keyPair: Ed25519Keypair,
  tx: Transaction,
  sponsoredIota: bigint | number | string
) {
  const storageApiBaseUrl = String(process.env.STORAGE_API_BASE_URL || "https://api.storage.objectid.io/api").replace(/\/+$/, "");
  const sender = keyPair.toIotaAddress();
  const sponsoredIotaText = String(sponsoredIota || "0");

  tx.setSender(sender);
  const transactionKind = await tx.build({ client, onlyTransactionKind: true });
  const prepare = await axios.post(`${storageApiBaseUrl}/sponsored-transactions/prepare`, {
    network,
    sender,
    sponsoredIota: sponsoredIotaText,
    transactionKindBytes: bytesToBase64(transactionKind),
  });

  const transactionBlockBytes = String(prepare.data?.transactionBlockBytes || "");
  if (!transactionBlockBytes) throw new Error("Storage backend did not return sponsored transaction bytes");

  const userSignature = (await keyPair.signTransaction(base64ToBytes(transactionBlockBytes))).signature;
  const { data } = await axios.post(`${storageApiBaseUrl}/sponsored-transactions/execute`, {
    network,
    sponsoredIota: sponsoredIotaText,
    transactionBlockBytes,
    userSignature,
  });

  assertStorageTransactionSucceeded(data);
  return data;
}

export function assertStorageTransactionSucceeded(txEffect: any) {
  const status = txEffect?.effects?.status?.status;
  if (status === "success") return;
  const error = txEffect?.effects?.status?.error || "Storage transaction failed";
  throw new Error(error);
}
