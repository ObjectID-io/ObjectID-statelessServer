import { IotaClient, type IotaObjectData, type IotaObjectRef } from "@iota/iota-sdk/client";
import { TransactionDataBuilder } from "@iota/iota-sdk/transactions";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { decodeIotaPrivateKey } from "@iota/iota-sdk/cryptography";
import {
  Credential,
  DIDUrl,
  DomainLinkageConfiguration,
  Duration,
  IdentityClientReadOnly,
  IotaDocument,
  Jwk,
  JwkMemStore,
  type JwsAlgorithm,
  JwsSignatureOptions,
  KeyIdMemStore,
  LinkedDomainService,
  MethodData,
  MethodDigest,
  MethodScope,
  MethodType,
  Storage,
  VerificationMethod,
  Timestamp,
} from "@iota/identity-wasm/node";
import { create as buildCreateIdentityTx } from "@iota/iota-interaction-ts/node/move_calls/identity/create";
import {
  executeUpdate as buildExecuteUpdateTx,
  proposeUpdate as buildProposeUpdateTx,
} from "@iota/iota-interaction-ts/node/move_calls/identity/update";
import { reserveGas, sponsorSignAndSubmit, type gasStationCfg } from "./signAndExecTx";
import { resolveDID } from "./resolveDID";
import { base64UrlEncode, normalizeLinkedDomain, wait } from "./utils";

const debug = false;
const GAS_BUDGET = 50_000_000;

type SharedObjectRef = {
  objectId: string;
  initialSharedVersion: string | number;
  mutable: boolean;
};

type SponsoredBuildResult = {
  reservationId: number;
  gasStationUrl: string;
  txBytes: Uint8Array;
};

type LinkDomainResult = {
  did: string;
  controllerCap: string;
  proposalId: string | null;
  proposalEffects: any;
  transactionEffects: any;
};

function normalizeHexId(value: string): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function extractDidObjectId(did: string): string {
  const parts = String(did ?? "").trim().split(":");
  const last = parts[parts.length - 1] ?? "";
  const normalized = normalizeHexId(last);

  if (!normalized) {
    throw new Error("Invalid DID.");
  }

  return normalized;
}

function toDidForNetwork(network: string, objectId: string): string {
  const normalizedObjectId = normalizeHexId(objectId);
  return network === "testnet" ? `did:iota:testnet:${normalizedObjectId}` : `did:iota:${normalizedObjectId}`;
}

function extractObjectData(entry: any): IotaObjectData | null {
  return (entry?.data ?? entry) as IotaObjectData | null;
}

function toObjectRef(data: IotaObjectData): IotaObjectRef {
  const objectId = data.objectId;
  const version = data.version;
  const digest = data.digest;

  if (!objectId || version == null || !digest) {
    throw new Error("Incomplete object reference.");
  }

  return { objectId, version, digest };
}

function extractControllerOf(data: IotaObjectData | null): string {
  const content: any = data?.content;
  const fields = content?.dataType === "moveObject" ? content.fields : undefined;
  return normalizeHexId(fields?.controller_of ?? "");
}

function extractEffectsStatusError(transactionEffects: any): string | null {
  const status = transactionEffects?.status?.status;
  if (status === "success") return null;
  return String(transactionEffects?.status?.error ?? "Unknown transaction failure.");
}

function assertEffectsSuccess(transactionEffects: any, context: string) {
  const error = extractEffectsStatusError(transactionEffects);
  if (error) {
    throw new Error(`${context} failed: ${error}`);
  }
}

async function getIdentityPackageId(client: IotaClient): Promise<string> {
  const readOnly = await IdentityClientReadOnly.create(client);
  const packageId = readOnly.packageId();

  if (!packageId) {
    throw new Error("Unable to resolve IOTA Identity package id.");
  }

  return packageId;
}

async function buildSponsoredTxBytes(
  client: IotaClient,
  senderAddress: string,
  txBcs: Uint8Array,
  gasStation: gasStationCfg,
  gasBudget = GAS_BUDGET,
): Promise<SponsoredBuildResult> {
  const reservedSponsorGasData = await reserveGas(gasBudget, gasStation);
  const gasPrice = await client.getReferenceGasPrice();
  const txData = TransactionDataBuilder.fromBytes(txBcs);
  const gasData = {
    budget: gasBudget.toString(),
    owner: reservedSponsorGasData.sponsor_address,
    payment: reservedSponsorGasData.gas_coins.map((coin) => ({
      objectId: coin.objectId,
      version: coin.version,
      digest: coin.digest,
    })),
    price: gasPrice.toString(),
  };
  const overrides = { sender: senderAddress, gasData };

  (txData as any).sender = overrides.sender;
  (txData as any).gasData = overrides.gasData;

  return {
    reservationId: reservedSponsorGasData.reservation_id,
    gasStationUrl: reservedSponsorGasData.gasStationUsed,
    txBytes: txData.build({ overrides }),
  };
}

async function signAndSubmitSponsoredTx(
  client: IotaClient,
  keyPair: Ed25519Keypair,
  txBcs: Uint8Array,
  gasStation: gasStationCfg,
  gasBudget = GAS_BUDGET,
) {
  const senderAddress = keyPair.toIotaAddress();
  const sponsored = await buildSponsoredTxBytes(client, senderAddress, txBcs, gasStation, gasBudget);
  const signedTx = await keyPair.signTransaction(sponsored.txBytes);

  return sponsorSignAndSubmit(
    sponsored.reservationId,
    sponsored.txBytes,
    signedTx.signature,
    sponsored.gasStationUrl,
  );
}

async function getSharedIdentityRef(client: IotaClient, did: string): Promise<SharedObjectRef> {
  const didObjectId = extractDidObjectId(did);
  const response: any = await client.getObject({
    id: didObjectId,
    options: { showOwner: true },
  });
  const initialSharedVersion = response?.data?.owner?.Shared?.initial_shared_version;

  if (initialSharedVersion == null) {
    throw new Error(`DID object ${didObjectId} is not shared or could not be resolved.`);
  }

  return { objectId: didObjectId, initialSharedVersion, mutable: true };
}

async function getControllerCapRefForDid(
  client: IotaClient,
  ownerAddress: string,
  identityPackageId: string,
  did: string,
): Promise<IotaObjectRef> {
  const expectedDidObjectId = extractDidObjectId(did).toLowerCase();
  const controllerCapType = `${identityPackageId}::controller::ControllerCap`;
  let cursor: string | null | undefined = null;

  do {
    const response: any = await client.getOwnedObjects({
      owner: ownerAddress,
      cursor: cursor ?? undefined,
      filter: { StructType: controllerCapType },
      options: {
        showType: true,
        showContent: true,
        showOwner: true,
      },
    });

    for (const entry of response?.data ?? []) {
      const data = extractObjectData(entry);
      const controllerOf = extractControllerOf(data);

      if (controllerOf.toLowerCase() === expectedDidObjectId) {
        return toObjectRef(data!);
      }
    }

    cursor = response?.hasNextPage ? response.nextCursor : null;
  } while (cursor);

  throw new Error(`ControllerCap not found for DID ${did}.`);
}

function extractCreatedDidObjectId(transactionEffects: any): string {
  const created = Array.isArray(transactionEffects?.created) ? transactionEffects.created : [];
  const entry = created.find((item: any) => item?.owner && typeof item.owner === "object" && "Shared" in item.owner);
  return normalizeHexId(String(entry?.reference?.objectId ?? ""));
}

async function findProposalIdFromEffects(
  client: IotaClient,
  transactionEffects: any,
): Promise<string | null> {
  const createdIds = (Array.isArray(transactionEffects?.created) ? transactionEffects.created : [])
    .map((entry: any) => normalizeHexId(String(entry?.reference?.objectId ?? "")))
    .filter(Boolean);

  if (createdIds.length === 0) {
    return null;
  }

  if (createdIds.length === 1) {
    return createdIds[0];
  }

  for (const objectId of createdIds) {
    const objectResponse: any = await client.getObject({
      id: objectId,
      options: { showType: true },
    });
    const objectType = String(objectResponse?.data?.type ?? "").toLowerCase();

    if (objectType.includes("proposal") || objectType.includes("update_did") || objectType.includes("updatedid")) {
      return objectId;
    }
  }

  return createdIds[0] ?? null;
}

export function getCompleteJwkFromKeyPair(keyPair: Ed25519Keypair, alg: JwsAlgorithm) {
  const publicKeyBytes = keyPair.getPublicKey().toRawBytes();
  const x = base64UrlEncode(publicKeyBytes);
  const privateKeyDecoded = decodeIotaPrivateKey(keyPair.getSecretKey()).secretKey;
  const d = privateKeyDecoded ? base64UrlEncode(privateKeyDecoded) : undefined;

  return new Jwk({
    kty: "OKP" as never,
    crv: "Ed25519",
    x,
    d,
    alg,
  });
}

export async function createDocumentForNetworkUsingKeyPair(
  storage: Storage,
  network: string,
  keyPair: Ed25519Keypair,
): Promise<[IotaDocument, string]> {
  const unpublished = new IotaDocument(network);
  const alg = "EdDSA" as JwsAlgorithm;
  const jwk = getCompleteJwkFromKeyPair(keyPair, alg);
  const keyId = await storage.keyStorage().insert(jwk);
  const publicJwk = jwk.toPublic();

  if (!publicJwk) {
    throw new Error("Public JWK could not be derived.");
  }

  const methodData = MethodData.newJwk(publicJwk);
  const methodFragment = keyId;
  const methodId = unpublished.id().join(`#${methodFragment}`);
  const method = new VerificationMethod(
    methodId,
    unpublished.id().toCoreDid(),
    MethodType.JsonWebKey2020(),
    methodData,
  );
  const methodDig = new MethodDigest(method);

  await storage.keyIdStorage().insertKeyId(methodDig, keyId);
  unpublished.insertMethod(method, MethodScope.VerificationMethod());

  return [unpublished, keyId];
}

export async function createIdentityForKeyPair(
  client: IotaClient,
  network: string,
  keyPair: Ed25519Keypair,
  gasStation: gasStationCfg,
): Promise<{ did: string; controllerCap?: string; transactionEffects: any }> {
  const storage = new Storage(new JwkMemStore(), new KeyIdMemStore());
  const localNetwork = network === "mainnet" ? "iota" : network;
  const [unpublished] = await createDocumentForNetworkUsingKeyPair(storage, localNetwork, keyPair);
  const identityPackageId = await getIdentityPackageId(client);
  const txBcs = await buildCreateIdentityTx(unpublished.pack(), identityPackageId);
  const transactionEffects = await signAndSubmitSponsoredTx(client, keyPair, txBcs, gasStation);

  assertEffectsSuccess(transactionEffects, "create_identity transaction");
  await wait(2);

  const didObjectId = extractCreatedDidObjectId(transactionEffects);
  const did = didObjectId ? toDidForNetwork(network, didObjectId) : "";
  let controllerCap: string | undefined;

  if (didObjectId) {
    const controllerCapRef = await getControllerCapRefForDid(client, keyPair.toIotaAddress(), identityPackageId, did);
    controllerCap = controllerCapRef.objectId;

    if (debug) {
      console.log("Created DID", did);
      console.log("ControllerCap", controllerCap);
    }
  }

  return { did, controllerCap, transactionEffects };
}

export async function downloadDLVC(did: string, localDomain: string, keypair: Ed25519Keypair) {
  const didDocument = await resolveDID(did);
  if (!didDocument) {
    throw new Error("Could not resolve DID");
  }

  const methodDigest = new MethodDigest(didDocument.methods()[0]);
  const alg = "EdDSA" as JwsAlgorithm;
  const jwk = getCompleteJwkFromKeyPair(keypair, alg);
  const storage = new Storage(new JwkMemStore(), new KeyIdMemStore());
  const keyId = await storage.keyStorage().insert(jwk);

  await storage.keyIdStorage().insertKeyId(methodDigest, keyId);

  const domainLinkageCredential = Credential.createDomainLinkageCredential({
    issuer: didDocument.id(),
    origin: localDomain,
    expirationDate: Timestamp.nowUTC().checkedAdd(Duration.weeks(52))!,
  });

  const vmFragment = didDocument.methods()[0].id().toString();
  const credentialJwt = await didDocument.createCredentialJwt(
    storage,
    vmFragment,
    domainLinkageCredential,
    new JwsSignatureOptions(),
  );

  const configurationResource = new DomainLinkageConfiguration([credentialJwt]);
  return {
    filename: `domain-linkage-${did}.json`,
    json: configurationResource.toJSON(),
  };
}

async function submitDidUpdate(
  client: IotaClient,
  did: string,
  didDocument: IotaDocument,
  keypair: Ed25519Keypair,
  gasStationCfg: gasStationCfg,
): Promise<LinkDomainResult> {
  const identityPackageId = await getIdentityPackageId(client);
  const identityRef = await getSharedIdentityRef(client, did);
  const controllerCapRef = await getControllerCapRefForDid(
    client,
    keypair.toIotaAddress(),
    identityPackageId,
    did,
  );

  const proposalTxBcs = await buildProposeUpdateTx(
    identityRef as any,
    controllerCapRef as any,
    didDocument.pack(),
    identityPackageId,
    undefined,
  );
  const proposalEffects = await signAndSubmitSponsoredTx(client, keypair, proposalTxBcs, gasStationCfg);
  assertEffectsSuccess(proposalEffects, "propose_update transaction");

  await wait(2);

  const proposalId = await findProposalIdFromEffects(client, proposalEffects);
  if (!proposalId) {
    return {
      did,
      controllerCap: controllerCapRef.objectId,
      proposalId: null,
      proposalEffects,
      transactionEffects: proposalEffects,
    };
  }

  const executeTxBcs = await buildExecuteUpdateTx(
    identityRef as any,
    controllerCapRef as any,
    proposalId,
    identityPackageId,
  );
  const transactionEffects = await signAndSubmitSponsoredTx(client, keypair, executeTxBcs, gasStationCfg);
  assertEffectsSuccess(transactionEffects, "execute_update transaction");

  await wait(2);

  return {
    did,
    controllerCap: controllerCapRef.objectId,
    proposalId,
    proposalEffects,
    transactionEffects,
  };
}

export const linkDomain = async (
  client: IotaClient,
  did: string,
  domain: string,
  keypair: Ed25519Keypair,
  gasStationCfg: gasStationCfg,
) => {
  const didDocument = await resolveDID(did);
  if (!didDocument) {
    throw new Error("Could not resolve DID");
  }

  const didId = didDocument.id();
  const serviceUrl: DIDUrl = didId.clone().join("#domain_linkage");
  const linkedDomainService = new LinkedDomainService({
    id: serviceUrl,
    domains: [normalizeLinkedDomain(domain)],
  });

  didDocument.insertService(linkedDomainService.toService());

  const result = await submitDidUpdate(client, didId.toString(), didDocument, keypair, gasStationCfg);
  return {
    did: didId.toString(),
    controllerCap: result.controllerCap,
    proposalId: result.proposalId,
    proposalEffects: result.proposalEffects,
    transactionEffects: result.transactionEffects,
  };
};

export const unlinkDomain = async (
  client: IotaClient,
  did: string,
  keypair: Ed25519Keypair,
  gasStationCfg: gasStationCfg,
) => {
  const didDocument = await resolveDID(did);
  if (!didDocument) {
    throw new Error("Could not resolve DID");
  }

  const didId = didDocument.id();
  const serviceUrl: DIDUrl = didId.clone().join("#domain_linkage");
  didDocument.removeService(serviceUrl);

  const result = await submitDidUpdate(client, didId.toString(), didDocument, keypair, gasStationCfg);
  return {
    did: didId.toString(),
    controllerCap: result.controllerCap,
    proposalId: result.proposalId,
    proposalEffects: result.proposalEffects,
    transactionEffects: result.transactionEffects,
  };
};
