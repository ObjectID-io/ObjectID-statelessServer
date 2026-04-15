import type { Request, Response } from "express";
import type { IotaObjectData, IotaObjectResponse } from "@iota/iota-sdk/client";
import { logInputs, nullSeed, setupEnv } from "./_common";

type JsonMap = Record<string, unknown>;

function isJsonMap(value: unknown): value is JsonMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractBalanceFromValue(value: unknown): string | null {
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = extractBalanceFromValue(item);
      if (candidate !== null) return candidate;
    }
    return null;
  }

  if (!isJsonMap(value)) return null;

  if ("balance" in value) {
    const direct = extractBalanceFromValue(value.balance);
    if (direct !== null) return direct;
  }

  if ("value" in value && Object.keys(value).length <= 2) {
    const nestedValue = extractBalanceFromValue(value.value);
    if (nestedValue !== null) return nestedValue;
  }

  for (const nested of Object.values(value)) {
    const candidate = extractBalanceFromValue(nested);
    if (candidate !== null) return candidate;
  }

  return null;
}

function extractBalanceFromObjectData(data?: IotaObjectData | null): string {
  if (!data?.content || !("fields" in data.content)) return "0";
  return extractBalanceFromValue(data.content.fields) ?? "0";
}

function mapToken(response: IotaObjectResponse) {
  const data = response.data ?? null;
  const objectId = data?.objectId ?? null;
  const version = data?.version ?? null;
  const digest = data?.digest ?? null;
  const type = data?.type ?? null;
  const balance = extractBalanceFromObjectData(data);

  return {
    objectId,
    version,
    digest,
    type,
    balance,
    content: data?.content ?? null,
  };
}

export default async function get_credit_token(req: Request, res: Response) {
  try {
    const { network, address } = req.body;

    logInputs("get_credit_token", { network, address });

    if (!address || typeof address !== "string") {
      res.status(400).json({
        success: false,
        error: "Missing or invalid 'address' in request body",
      });
      return;
    }

    if (!network || typeof network !== "string") {
      res.status(400).json({
        success: false,
        error: "Missing or invalid 'network' in request body",
      });
      return;
    }

    const { client, tokenCreditType } = await setupEnv(nullSeed, network);

    const ownedTokens = await client.getOwnedObjects({
      owner: address,
      filter: { StructType: tokenCreditType },
      options: {
        showType: true,
        showOwner: false,
        showPreviousTransaction: false,
        showDisplay: true,
        showContent: true,
        showBcs: false,
        showStorageRebate: false,
      },
    });

    const creditTokens = ownedTokens.data.map(mapToken);
    const totalBalance = creditTokens.reduce((sum, token) => sum + BigInt(token.balance), 0n).toString();

    res.json({
      success: true,
      address,
      network,
      tokenType: tokenCreditType,
      totalBalance,
      count: creditTokens.length,
      creditTokens,
      page: {
        hasNextPage: ownedTokens.hasNextPage,
        nextCursor: ownedTokens.nextCursor ?? null,
      },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Unexpected error",
    });
  }
}
