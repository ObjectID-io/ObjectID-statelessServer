import type { Request, Response } from "express";
import axios from "axios";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Transaction } from "@iota/iota-sdk/transactions";
import {
  DomainLinkageConfiguration,
  EdDSAJwsVerifier,
  type IotaDocument,
  JwtCredentialValidationOptions,
  JwtDomainLinkageValidator,
} from "@iota/identity-wasm/node";
import { getObject } from "../utils/getObject";
import { resolveDidDocument } from "../utils/identity";
import { singAndExecTx } from "../utils/signAndExecTx";
import { logInputs, setupEnv, useGasStation } from "./_common";

type ControllerCapObject = {
  content?: {
    fields?: {
      controller_of?: string;
    };
  };
  owner?: {
    AddressOwner?: string;
  };
};

function oracleSeedForNetwork(network: string): string {
  const isTestnet = network === "testnet";
  const seed =
    (isTestnet ? process.env.TESTNET_ORACLE_SEED : process.env.MAINNET_ORACLE_SEED) ||
    (isTestnet ? process.env.ORACLE_SEED_TESTNET : process.env.ORACLE_SEED_MAINNET) ||
    process.env.ORACLE_SEED ||
    "";

  return String(seed).trim();
}

async function getJwtData(client: Awaited<ReturnType<typeof setupEnv>>["client"], controllerCap: string, network: string) {
  const cCapObject = (await getObject(client, controllerCap)) as ControllerCapObject;
  const didAlias = cCapObject?.content?.fields?.controller_of;
  const ownerAddress = cCapObject?.owner?.AddressOwner;

  if (!didAlias || !ownerAddress) {
    throw new Error("Invalid controllerCap: missing controller_of or owner.");
  }

  const didDocument = await resolveDidDocument(client, didAlias, network);
  const service = didDocument.service().find((svc) => svc.type().includes("LinkedDomains"));

  if (!service) {
    throw new Error("No LinkedDomains service found in DID Document.");
  }

  const rawEndpoint = service.serviceEndpoint();
  const endpoint =
    typeof rawEndpoint === "string"
      ? rawEndpoint
      : Array.isArray(rawEndpoint)
        ? String(rawEndpoint[0] || "")
        : "";

  if (!endpoint) {
    throw new Error("Invalid LinkedDomains service endpoint.");
  }

  const configUrl = `${endpoint.replace(/\/$/, "")}/.well-known/did-configuration.json`;
  const response = await axios.get(configUrl);

  if (!response?.data?.linked_dids || !Array.isArray(response.data.linked_dids)) {
    throw new Error("Invalid DID Configuration Resource format.");
  }

  return {
    didDocument,
    jwtData: response.data,
    ownerAddress,
    configUrl,
  };
}

function validateJwt(didDocument: IotaDocument, jwtData: any) {
  const service = didDocument.service().find((svc) => svc.type().includes("LinkedDomains"));

  if (!service) {
    throw new Error("No LinkedDomains service found in DID Document.");
  }

  const rawEndpoint = service.serviceEndpoint();
  const endpoint =
    typeof rawEndpoint === "string"
      ? rawEndpoint
      : Array.isArray(rawEndpoint)
        ? String(rawEndpoint[0] || "")
        : "";

  if (!endpoint) {
    throw new Error("Invalid LinkedDomains service endpoint.");
  }

  const config = DomainLinkageConfiguration.fromJSON(jwtData);
  new JwtDomainLinkageValidator(new EdDSAJwsVerifier()).validateLinkage(
    didDocument,
    config,
    endpoint,
    new JwtCredentialValidationOptions(),
  );
}

async function findExistingOidControllerCap(
  client: Awaited<ReturnType<typeof setupEnv>>["client"],
  ownerAddress: string,
  packageid: string,
  controlledAliasId: string,
): Promise<string | null> {
  const structType = `${packageid}::oid_identity::ControllerCap`;
  const owned = await client.getOwnedObjects({
    owner: ownerAddress,
    filter: { StructType: structType },
    options: { showType: true, showContent: true },
  });

  for (const item of owned.data) {
    const objectId = item.data?.objectId;
    const fields = (item.data?.content as any)?.fields;
    const controllerOf = String(fields?.controller_of ?? "").trim();
    if (objectId && controllerOf === controlledAliasId) {
      return objectId;
    }
  }

  return null;
}

export default async function create_OID_controllerCap(req: Request, res: Response) {
  try {
    const { packageid, controllerCap, network } = req.body;

    logInputs("create_OID_controllerCap", { packageid, controllerCap, network });

    if (!packageid || typeof packageid !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'packageid'." });
      return;
    }

    if (!controllerCap || typeof controllerCap !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'controllerCap'." });
      return;
    }

    if (!network || typeof network !== "string") {
      res.status(400).json({ success: false, error: "Missing or invalid 'network'." });
      return;
    }

    const oracleSeed = oracleSeedForNetwork(network);
    if (!oracleSeed) {
      res.status(500).json({
        success: false,
        error: "Missing oracle seed. Set TESTNET_ORACLE_SEED / MAINNET_ORACLE_SEED (or ORACLE_SEED_*).",
      });
      return;
    }

    const { client, gasStation } = await setupEnv(oracleSeed, network);
    const keyPair = Ed25519Keypair.deriveKeypairFromSeed(oracleSeed);

    const { didDocument, jwtData, ownerAddress, configUrl } = await getJwtData(client, controllerCap, network);
    validateJwt(didDocument, jwtData);

    const controlledAliasId = String(didDocument.id().toString().split(":").pop() || "").trim();
    if (!controlledAliasId) {
      throw new Error("Unable to derive DID alias id.");
    }

    const existing = await findExistingOidControllerCap(client, ownerAddress, packageid, controlledAliasId);
    if (existing) {
      res.json({
        success: true,
        message: "OIDControllerCap already exists.",
        url: configUrl,
        OIDcontrollerCap: existing,
      });
      return;
    }

    const domainOnly = new URL(configUrl).host;
    const linkedDomain = `https://${domainOnly}/`;

    const tx = new Transaction();
    tx.moveCall({
      arguments: [tx.pure.id(controlledAliasId), tx.pure.string(linkedDomain), tx.pure.address(ownerAddress)],
      target: `${packageid}::oid_identity::create_controllerCap`,
    });
    tx.setGasBudget(10_000_000);

    await singAndExecTx(network, client, gasStation, useGasStation, keyPair, tx, {
      onSuccess: (result) => {
        const newObjectId = result.effects?.created?.[0]?.reference?.objectId || null;
        if (!newObjectId) {
          res.json({ success: false, txDigest: result.digest, error: "OIDControllerCap not found in tx effects." });
          return;
        }

        res.json({
          success: true,
          message: "DID domain linkage VC is reachable and valid",
          url: configUrl,
          txDigest: result.digest,
          OIDcontrollerCap: newObjectId,
          effects: result.effects,
        });
      },
      onError: (err) => {
        res.json({ success: false, error: err });
      },
      onSettled: () => {},
    });
  } catch (err) {
    console.error("create_OID_controllerCap failed:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}
