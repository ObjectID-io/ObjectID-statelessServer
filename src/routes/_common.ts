import { ExecutionStatus, getFullnodeUrl, IotaClient, IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import type { gasStationCfg } from "../utils/signAndExecTx";
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

/**
 * Setup IOTA env (network + seed)
 * Keeps same behavior as original code (module-level config vars).
 */
export async function setupEnv(seed: string, network: string): Promise<SetupEnvResult> {
  const client = new IotaClient({ url: getFullnodeUrl(network) });
  const keyPair = Ed25519Keypair.deriveKeypairFromSeed(seed);

  if (network === "testnet") {
    packageID = "0x79857c1738f31d70165149678ae051d5bffbaa26dbb66a25ad835e09f2180ae5";
    documentPackageID = "0xe3721e7e4dadd94ca6806f87c1c3a6369319e2c1d22b0c8c7b5a4a7d74d6932a";
    gs1PackageId = "0xcc649f565186a6f800505330f7d0ff6cddbb1bc4b49e2e22457a8c0de9091b6e";
    gs1RegistryId = "0xf002c0a2b8eb478ee3db15237d2873973ce535e00a667d98b547c17d941223b9";
    graphqlProvider = process.env.GRAPHQL_PROVIDER || "https://graphql.testnet.iota.cafe/";
    gasStation = {
      gasStation1URL: "https://gas1.objectid.io",
      gasStation1Token: "1111",
      gasStation2URL: "https://gas2.objectid.io",
      gasStation2Token: "1111",
    };
  } else {
    packageID = "0xc6b77b8ab151fda5c98b544bda1f769e259146dc4388324e6737ecb9ab1a7465";
    documentPackageID = "0x6399e60508027bc419c5ba01d77859dfee4c266e93c0c70e48fe7079b1c76079";
    gs1PackageId = "0x949abb7b9e90778d62a70636736a69376284f31f0e40a3e5e7003a839d72be34";
    gs1RegistryId = "0xc394c07808f875fe7bd5590941652e94237fbad1ec525c35b5e4e6dcf4429e43";
    graphqlProvider = process.env.GRAPHQL_PROVIDER || "https://graphql.mainnet.iota.cafe/";
    gasStation = {
      gasStation1URL: "https://m-gas1.objectid.io",
      gasStation1Token: "1111",
      gasStation2URL: "https://m-gas2.objectid.io",
      gasStation2Token: "1111",
    };
  }

  tokenCreditType = `0x2::token::Token<${packageID}::oid_credit::OID_CREDIT>`;
  policyTokenType = `0x2::token::TokenPolicy<${packageID}::oid_credit::OID_CREDIT>`;
  OIDobjectType = `${packageID}::oid_object::OIDObject`;

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
    gasStation,
    tokenCreditType,
    policyTokenType,
    OIDobjectType,
  };
}
