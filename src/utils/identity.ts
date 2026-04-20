import { decodeIotaPrivateKey } from "@iota/iota-sdk/cryptography";
import type { IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { IotaClient } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import {
  DIDUrl,
  IdentityClient,
  IdentityClientReadOnly,
  IotaDID,
  IotaDocument,
  Jwk,
  JwkMemStore,
  type JwsAlgorithm,
  KeyIdMemStore,
  LinkedDomainService,
  MethodData,
  MethodDigest,
  MethodScope,
  MethodType,
  Storage,
  StorageSigner,
  VerificationMethod,
} from "@iota/identity-wasm/node";
import {
  createIdentityForKeyPair as createIdentityForKeyPairWithGasStation,
  linkDomain as linkDomainWithGasStation,
} from "./IdentityUtils";
import { parseDidAliasId, didFromAliasId, normalizeIdentityNetwork } from "./identityNetwork";
function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export { didFromAliasId };

export async function resolveDidDocument(client: IotaClient, didOrAlias: string, network: string): Promise<IotaDocument> {
  const localNetwork = normalizeIdentityNetwork(network);
  const aliasId = didOrAlias.includes(":") ? didOrAlias.split(":").pop() || "" : didOrAlias;

  if (!aliasId) {
    throw new Error("Missing DID alias id.");
  }

  const identityClientReadOnly = await IdentityClientReadOnly.create(client);
  const iotaDid = IotaDID.fromAliasId(aliasId, localNetwork);
  return await identityClientReadOnly.resolveDid(iotaDid);
}

export function getCompleteJwkFromKeyPair(keyPair: Ed25519Keypair, alg: JwsAlgorithm) {
  const publicKeyBytes = keyPair.getPublicKey().toRawBytes();
  const x = base64UrlEncode(publicKeyBytes);

  const privateKeyDecoded = decodeIotaPrivateKey(keyPair.getSecretKey()).secretKey;
  const d = privateKeyDecoded ? base64UrlEncode(privateKeyDecoded) : undefined;

  return new Jwk({
    kty: "OKP" as any,
    crv: "Ed25519",
    x,
    d,
    alg,
  });
}

export async function getIdentityFromKeyPair(
  client: IotaClient,
  storage: Storage,
  keypair: Ed25519Keypair,
  alg: JwsAlgorithm,
): Promise<IdentityClient> {
  const identityClientReadOnly = await IdentityClientReadOnly.create(client);

  const jwk = getCompleteJwkFromKeyPair(keypair, alg);
  const publicKeyJwk = jwk.toPublic();

  if (!publicKeyJwk) {
    throw new Error("Failed to derive public JWK from generated JWK.");
  }

  const keyId = await storage.keyStorage().insert(jwk);
  const storedKeyExists = await storage.keyStorage().exists(keyId);

  if (!storedKeyExists) {
    throw new Error("Key was not properly stored in keyStorage.");
  }

  const signer = new StorageSigner(storage, keyId, publicKeyJwk);
  return await IdentityClient.create(identityClientReadOnly, signer);
}

export async function createDocumentForNetworkUsingKeyPair(
  storage: Storage,
  network: string,
  keyPair: Ed25519Keypair,
): Promise<IotaDocument> {
  const unpublished = new IotaDocument(network);
  const alg = "EdDSA" as JwsAlgorithm;
  const jwk = getCompleteJwkFromKeyPair(keyPair, alg);

  const keyId = await storage.keyStorage().insert(jwk);
  const publicJwk = jwk.toPublic();

  if (!publicJwk) {
    throw new Error("Public JWK could not be derived.");
  }

  const methodData = MethodData.newJwk(publicJwk);
  const methodId = unpublished.id().join(`#${keyId}`);

  const method = new VerificationMethod(
    methodId,
    unpublished.id().toCoreDid(),
    MethodType.JsonWebKey2020(),
    methodData,
  );

  const methodDigest = new MethodDigest(method);
  await storage.keyIdStorage().insertKeyId(methodDigest, keyId);
  unpublished.insertMethod(method, MethodScope.VerificationMethod());

  return unpublished;
}

export async function createIdentityForKeyPair(
  client: IotaClient,
  network: string,
  keyPair: Ed25519Keypair,
): Promise<{ did: string; response: IotaTransactionBlockResponse }> {
  const result = await createIdentityForKeyPairWithGasStation(client, network, keyPair, {
    gasStation1URL: "",
    gasStation1Token: "",
    gasStation2URL: "",
    gasStation2Token: "",
  } as any);

  return {
    did: result.did,
    response: {
      digest: result.transactionEffects?.transactionDigest ?? "",
      effects: result.transactionEffects ?? null,
    } as IotaTransactionBlockResponse,
  };
}

export async function linkDomainToIdentity(
  client: IotaClient,
  did: string,
  network: string,
  domain: string,
  keypair: Ed25519Keypair,
): Promise<{ did: string; response: IotaTransactionBlockResponse }> {
  const didDocument = await resolveDidDocument(client, did, network);
  const serviceUrl: DIDUrl = didDocument.id().clone().join("#domain_linkage");
  const normalizedDomain = domain.startsWith("http") ? domain : `https://${domain}`;

  const linkedDomainService = new LinkedDomainService({
    id: serviceUrl,
    domains: [normalizedDomain],
  });

  didDocument.insertService(linkedDomainService.toService());

  const alg = "EdDSA" as JwsAlgorithm;
  const jwk = getCompleteJwkFromKeyPair(keypair, alg);
  const storage = new Storage(new JwkMemStore(), new KeyIdMemStore());
  const keyId = await storage.keyStorage().insert(jwk);
  const methodDigest = new MethodDigest(didDocument.methods()[0]);

  await storage.keyIdStorage().insertKeyId(methodDigest, keyId);

  const identityClient = await getIdentityFromKeyPair(client, storage, keypair, alg);

  const gasBudget = 50_000_000;
  const objectId = parseDidAliasId(didDocument.id().toString()) ?? didDocument.id().toUrl().toString().split(":").pop() ?? "";
  const identity = (await identityClient.getIdentity(objectId)).toFullFledged();

  if (!identity) {
    throw new Error("Identity not found on-chain.");
  }
  const result = await linkDomainWithGasStation(
    client,
    did,
    normalizedDomain,
    keypair,
    {
      gasStation1URL: "",
      gasStation1Token: "",
      gasStation2URL: "",
      gasStation2Token: "",
    } as any,
  );

  return {
    did: result?.did ?? didDocument.id().toString(),
    response: {
      digest: result?.transactionEffects?.transactionDigest ?? "",
      effects: result?.transactionEffects ?? null,
    } as IotaTransactionBlockResponse,
  };
}

