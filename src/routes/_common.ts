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
  gasStation: gasStationCfg;
  tokenCreditType: string;
  policyTokenType: string;
  OIDobjectType: string;
};

let policy: string;
let packageID: string;
let documentPackageID: string;
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
    documentPackageID = "0x6e884a623d5661fca38cf9601cbc9fb85fa1d5aaff28a1fe96d260437b971ba7";
    graphqlProvider = process.env.GRAPHQL_PROVIDER || "https://graphql.testnet.iota.cafe/";
    gasStation = {
      gasStation1URL: "https://gas1.objectid.io",
      gasStation1Token: "1111",
      gasStation2URL: "https://gas2.objectid.io",
      gasStation2Token: "1111",
    };
  } else {
    packageID = "0xc6b77b8ab151fda5c98b544bda1f769e259146dc4388324e6737ecb9ab1a7465";
    documentPackageID = "0x23ba3cf060ea3fbb53542e1a3347ee1eb215913081fecdf1eda462c3101da556";
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
    gasStation,
    tokenCreditType,
    policyTokenType,
    OIDobjectType,
  };
}
