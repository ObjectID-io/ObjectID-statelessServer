import { ExecutionStatus, getFullnodeUrl, IotaClient, IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import type { gasStationCfg } from "../utils/signAndExecTx";
import { loadEffectiveOnChainConfig, normalizeObjectIdNetwork } from "../utils/onchainConfig";
import { searchObjectsByType, type ObjectEdge } from "../utils/searchObjectByType";

export const nullSeed = "0000000000000000000000000000000000000000000000000000000000000000";
export const useGasStation = true;

export type SetupEnvResult = {
  client: IotaClient;
  keyPair: Ed25519Keypair;
  graphqlProvider: string;
  policy: string;
  packageID: string;
  documentPackageID: string;
  gs1PackageId: string;
  gs1RegistryId: string;
  storagePackageID: string;
  storageCreditPackageID: string;
  storagePolicyID: string;
  oracleTasksPackageID: string;
  oracleStateID: string;
  oracleSystemPackageID: string;
  oracleTaskRegistryID: string;
  oracleNodeRegistryID: string;
  storageCreditType: string;
  storageObjectType: string;
  storageCreditValueIota: number;
  storageCreditPriceEurCents: number;
  gasStation: gasStationCfg;
  tokenCreditType: string;
  policyTokenType: string;
  OIDobjectType: string;
};

let policy: string;
let packageID: string;
let documentPackageID: string;
let gs1PackageId: string;
let gs1RegistryId: string;
let storagePackageID: string;
let storageCreditPackageID: string;
let storagePolicyID: string;
let oracleTasksPackageID: string;
let oracleStateID: string;
let oracleSystemPackageID: string;
let oracleTaskRegistryID: string;
let oracleNodeRegistryID: string;
let storageCreditType: string;
let storageObjectType: string;
let storageCreditValueIota: number;
let storageCreditPriceEurCents: number;
let graphqlProvider: string;
let gasStation: gasStationCfg;
let tokenCreditType: string;
let policyTokenType: string;
let OIDobjectType: string;

/**
 * Logging helper (hides seed)
 */
export function logInputs(route: string, inputs: any) {
  console.log("==============================================================");
  console.log(` ${route}`);
  console.log("==============================================================");
  for (const [key, value] of Object.entries(inputs)) {
    if (key.toLowerCase() === "seed") continue;
    console.log(`${key}:`, value);
  }
}

export function asJsonString(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const str = typeof value === "string" ? value.trim() : "";
    if (str) return str;
  }
  return "";
}

function stringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      const arr = value.map((item) => String(item ?? "").trim()).filter(Boolean);
      if (arr.length) return arr;
    }
  }
  return [];
}

function packageAtVersion(packages: string[], version: unknown): string {
  if (!packages.length) return "";
  const index = Number(version ?? 0);
  return packages[index >= 0 && index < packages.length ? index : 0] ?? "";
}

function numberFromConfig(value: unknown, fallback: string): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : Number(fallback);
}

function gasStationFromConfig(cfg: any, net: "testnet" | "mainnet"): gasStationCfg {
  const configured = cfg?.gasStation ?? cfg?.gas_station ?? {};
  const prefix = net === "testnet" ? "TESTNET" : "MAINNET";

  return {
    gasStation1URL: firstString(
      configured.gasStation1URL,
      configured.gas_station_1_url,
      process.env[`${prefix}_GAS_STATION_1_URL`],
      net === "testnet" ? "https://gas1.objectid.io" : "https://m-gas1.objectid.io",
    ),
    gasStation1Token: firstString(
      configured.gasStation1Token,
      configured.gas_station_1_token,
      process.env[`${prefix}_GAS_STATION_1_TOKEN`],
      "1111",
    ),
    gasStation2URL: firstString(
      configured.gasStation2URL,
      configured.gas_station_2_url,
      process.env[`${prefix}_GAS_STATION_2_URL`],
      net === "testnet" ? "https://gas2.objectid.io" : "https://m-gas2.objectid.io",
    ),
    gasStation2Token: firstString(
      configured.gasStation2Token,
      configured.gas_station_2_token,
      process.env[`${prefix}_GAS_STATION_2_TOKEN`],
      "1111",
    ),
  };
}

/**
 * Setup IOTA env (network + seed)
 * Loads ObjectID runtime ids from the on-chain oid_config::Config, with legacy fallbacks.
 */
export async function setupEnv(seed: string, network: string): Promise<SetupEnvResult> {
  const net = normalizeObjectIdNetwork(network);
  const client = new IotaClient({ url: getFullnodeUrl(net) });
  const keyPair = Ed25519Keypair.deriveKeypairFromSeed(seed);
  const ownerAddress = keyPair.toIotaAddress();

  let cfg: Record<string, any> = {};
  try {
    const loaded = await loadEffectiveOnChainConfig(net, client, ownerAddress);
    cfg = loaded.json;
    console.log(`Loaded ObjectID on-chain config: ${loaded.source} ${loaded.objectId}`);
  } catch (err: any) {
    console.warn(`Unable to load ObjectID on-chain config, using legacy fallbacks: ${err?.message ?? err}`);
  }

  const objectPackages = stringArray(cfg.objectPackages, cfg.object_packages);
  const documentPackages = stringArray(cfg.documentPackages, cfg.document_packages);
  const objectPackageFromVersion = packageAtVersion(objectPackages, cfg.objectDefaultPackageVersion ?? cfg.object_default_package_version);
  const documentPackageFromVersion = packageAtVersion(
    documentPackages,
    cfg.documentDefaultPackageVersion ?? cfg.document_default_package_version,
  );

  if (net === "testnet") {
    packageID = firstString(cfg.OIDobjectPackage, cfg.oidObjectPackage, objectPackageFromVersion, "0x79857c1738f31d70165149678ae051d5bffbaa26dbb66a25ad835e09f2180ae5");
    documentPackageID = firstString(documentPackageFromVersion, "0xe3721e7e4dadd94ca6806f87c1c3a6369319e2c1d22b0c8c7b5a4a7d74d6932a");
    gs1PackageId = firstString(cfg.OIDgs1Pagackage, cfg.OIDgs1Package, cfg.gs1Package, process.env.TESTNET_GS1_PACKAGE_ID, "0xcc649f565186a6f800505330f7d0ff6cddbb1bc4b49e2e22457a8c0de9091b6e");
    gs1RegistryId = firstString(cfg.OIDgs1RegistryId, cfg.OIDgs1RegistryID, cfg.gs1RegistryId, process.env.TESTNET_GS1_REGISTRY_ID, "0xf002c0a2b8eb478ee3db15237d2873973ce535e00a667d98b547c17d941223b9");
    storagePackageID = firstString(cfg.OIDstoragePackage, cfg.storagePackageID, cfg.storagePackageId, process.env.TESTNET_STORAGE_PACKAGE_ID, "0xdf25f06d3cf2066decb77ed8f174147b27b931512e8eb7e6b61f0c7ef782feca");
    storageCreditPackageID = firstString(cfg.OIDstorageCreditPackage, cfg.storageCreditPackageID, cfg.storageCreditPackageId, process.env.TESTNET_STORAGE_CREDIT_PACKAGE_ID, "0xe000ed1ccc28395c7cb7e4d5531c095299093d9f77fe900c7c2d0550c0003a80");
    storagePolicyID = firstString(cfg.OIDstoragePolicyId, cfg.storagePolicyID, cfg.storagePolicyId, process.env.TESTNET_STORAGE_POLICY_ID, "0xbcb1dc2d3f365cf03f6af523d5a2ddd444b08532274b7e30f0d98c949e5de0d0");
    oracleTasksPackageID = firstString(cfg.oracleTasksPackageID, cfg.oracleTasksPackageId, process.env.TESTNET_ORACLE_TASKS_PACKAGE_ID, "0x4586bab7b07a8dbeeb43770a7974bfcbb885f2e6985439cac1f28ecf58332892");
    oracleStateID = firstString(cfg.oracleStateID, cfg.oracleStateId, process.env.TESTNET_ORACLE_STATE_ID, "0x75433fd0d878a1bf14607894d9c7305e63976e2711ee9ffd0f04b0dc0924d5a7");
    oracleSystemPackageID = firstString(cfg.oracleSystemPackageID, cfg.oracleSystemPackageId, process.env.TESTNET_ORACLE_SYSTEM_PACKAGE_ID, "0x24360e39643f72e1edb197aa37ce37ec667775f9e85f35a01a94d8fb9f6b8357");
    oracleTaskRegistryID = firstString(cfg.oracleTaskRegistryID, cfg.oracleTaskRegistryId, process.env.TESTNET_ORACLE_TASK_REGISTRY_ID, "0xe69f7eac8ea3c04028c1665409984acfd5a19064cf70686e83604e9db9f83a1e");
    oracleNodeRegistryID = firstString(cfg.oracleNodeRegistryID, cfg.oracleNodeRegistryId, process.env.TESTNET_ORACLE_NODE_REGISTRY_ID, "0x21107c5af0b666483ecd4ec963467fbd82275543f09fb28c176a9abecbbbfb12");
    graphqlProvider = firstString(cfg.graphqlProvider, cfg.graphql_provider, process.env.GRAPHQL_PROVIDER, "https://graphql.testnet.iota.cafe/");
  } else {
    packageID = firstString(cfg.OIDobjectPackage, cfg.oidObjectPackage, objectPackageFromVersion, "0xc6b77b8ab151fda5c98b544bda1f769e259146dc4388324e6737ecb9ab1a7465");
    documentPackageID = firstString(documentPackageFromVersion, "0x6399e60508027bc419c5ba01d77859dfee4c266e93c0c70e48fe7079b1c76079");
    gs1PackageId = firstString(cfg.OIDgs1Pagackage, cfg.OIDgs1Package, cfg.gs1Package, process.env.MAINNET_GS1_PACKAGE_ID, "0x949abb7b9e90778d62a70636736a69376284f31f0e40a3e5e7003a839d72be34");
    gs1RegistryId = firstString(cfg.OIDgs1RegistryId, cfg.OIDgs1RegistryID, cfg.gs1RegistryId, process.env.MAINNET_GS1_REGISTRY_ID, "0xc394c07808f875fe7bd5590941652e94237fbad1ec525c35b5e4e6dcf4429e43");
    storagePackageID = firstString(cfg.OIDstoragePackage, cfg.storagePackageID, cfg.storagePackageId, process.env.MAINNET_STORAGE_PACKAGE_ID);
    storageCreditPackageID = firstString(cfg.OIDstorageCreditPackage, cfg.storageCreditPackageID, cfg.storageCreditPackageId, process.env.MAINNET_STORAGE_CREDIT_PACKAGE_ID);
    storagePolicyID = firstString(cfg.OIDstoragePolicyId, cfg.storagePolicyID, cfg.storagePolicyId, process.env.MAINNET_STORAGE_POLICY_ID);
    oracleTasksPackageID = firstString(cfg.oracleTasksPackageID, cfg.oracleTasksPackageId, process.env.MAINNET_ORACLE_TASKS_PACKAGE_ID);
    oracleStateID = firstString(cfg.oracleStateID, cfg.oracleStateId, process.env.MAINNET_ORACLE_STATE_ID);
    oracleSystemPackageID = firstString(cfg.oracleSystemPackageID, cfg.oracleSystemPackageId, process.env.MAINNET_ORACLE_SYSTEM_PACKAGE_ID);
    oracleTaskRegistryID = firstString(cfg.oracleTaskRegistryID, cfg.oracleTaskRegistryId, process.env.MAINNET_ORACLE_TASK_REGISTRY_ID);
    oracleNodeRegistryID = firstString(cfg.oracleNodeRegistryID, cfg.oracleNodeRegistryId, process.env.MAINNET_ORACLE_NODE_REGISTRY_ID);
    graphqlProvider = firstString(cfg.graphqlProvider, cfg.graphql_provider, process.env.GRAPHQL_PROVIDER, "https://graphql.mainnet.iota.cafe/");
  }

  const creditPackageID = firstString(cfg.OIDcreditPackage, cfg.oidCreditPackage, packageID);

  gasStation = gasStationFromConfig(cfg, net);
  tokenCreditType = `0x2::token::Token<${creditPackageID}::oid_credit::OID_CREDIT>`;
  policyTokenType = `0x2::token::TokenPolicy<${creditPackageID}::oid_credit::OID_CREDIT>`;
  OIDobjectType = `${packageID}::oid_object::OIDObject`;
  storageCreditType = storageCreditPackageID ? `0x2::token::Token<${storageCreditPackageID}::oid_storage_credit::OID_STORAGE_CREDIT>` : "";
  storageObjectType = storagePackageID ? `${storagePackageID}::oid_storage::OIDStorageObject` : "";
  storageCreditValueIota = numberFromConfig(cfg.storageCreditValueIota ?? cfg.storage_credit_value_iota, process.env.STORAGE_CREDIT_VALUE_IOTA || "100000000");
  storageCreditPriceEurCents = numberFromConfig(
    cfg.storageCreditPriceEurCents ?? cfg.storage_credit_price_eur_cents,
    process.env.STORAGE_CREDIT_PRICE_EUR_CENTS || "100",
  );

  const pedges: ObjectEdge[] = await searchObjectsByType(policyTokenType, null, graphqlProvider);
  policy = pedges[0].node.address;

  return {
    client,
    keyPair,
    graphqlProvider,
    policy,
    packageID,
    documentPackageID,
    gs1PackageId,
    gs1RegistryId,
    storagePackageID,
    storageCreditPackageID,
    storagePolicyID,
    oracleTasksPackageID,
    oracleStateID,
    oracleSystemPackageID,
    oracleTaskRegistryID,
    oracleNodeRegistryID,
    storageCreditType,
    storageObjectType,
    storageCreditValueIota,
    storageCreditPriceEurCents,
    gasStation,
    tokenCreditType,
    policyTokenType,
    OIDobjectType,
  };
}
