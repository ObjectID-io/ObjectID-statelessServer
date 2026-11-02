import { Transaction } from '@iota/iota-sdk/transactions';
import type { IotaClient, IotaTransactionBlockResponse } from '@iota/iota-sdk/client';
import { MoveAuthenticatorBuilder, MoveSigner } from '@iota/iota-sdk/keypairs/move-authenticator';
import { normalizeIotaAddress } from '@iota/iota-sdk/utils';
import { loadPublicOnChainConfig, type LoadedOnChainConfig } from './onchainConfig';
import type { gasStationCfg } from './signAndExecTx';

export type AaSponsorConfig = { sponsorAccountId: string; packageId: string; typePackageId?: string };
export type SponsorshipConfig =
  | { mode: 'gas-station'; aa?: AaSponsorConfig }
  | { mode: 'aa-onchain'; aa: AaSponsorConfig };

export type PreparedSponsorGas = {
  mode: 'gas-station' | 'aa-onchain';
  network: string;
  configObjectId: string;
  sponsorAddress: string;
  gasPayment: { objectId: string; version: string; digest: string }[];
  gasBudget: number;
  gasPrice: string;
  reservationId?: number;
  stationUrl?: string;
  stationToken?: string;
  aaPackageId?: string;
  release: () => void;
};

export function sponsorshipMode(json: Record<string, any>): 'gas-station' | 'aa-onchain' | 'direct' {
  if (json.sponsorship === undefined) return json.useGasStation ? 'gas-station' : 'direct';
  const mode = json.sponsorship?.mode;
  if (mode !== 'gas-station' && mode !== 'aa-onchain') throw new Error('Invalid on-chain sponsorship.mode');
  return mode;
}

function positive(value: unknown, name: string): number {
  const n = Number(typeof value === 'string' ? value.replace(/_/g, '') : value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`Invalid ${name}`);
  return n;
}

async function post(url: string, token: string, data: unknown): Promise<any> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Gas Station HTTP ${r.status}: ${text}`);
  return JSON.parse(text);
}

// Serialize sponsor coin selection within this process. Independent processes
// and devices still need multiple funded sponsor coins for throughput.
const queues = new Map<string, Promise<void>>();
async function acquire(key: string): Promise<() => void> {
  const previous = queues.get(key) ?? Promise.resolve();
  let unlock!: () => void;
  const current = new Promise<void>(resolve => { unlock = resolve; });
  queues.set(key, current);
  await previous;
  let released = false;
  return () => { if (released) return; released = true; unlock(); if (queues.get(key) === current) queues.delete(key); };
}

export async function prepareSponsoredGas(
  client: IotaClient, network: string, requestedBudget?: number, config?: LoadedOnChainConfig,
): Promise<PreparedSponsorGas> {
  const loaded = config ?? await loadPublicOnChainConfig(network, client);
  const json = loaded.json;
  const expectedNetwork = network === 'iota' ? 'mainnet' : network;
  if (expectedNetwork !== 'mainnet' && expectedNetwork !== 'testnet') throw new Error('Unsupported sponsorship network');
  if (json.network && (json.network === 'iota' ? 'mainnet' : json.network) !== expectedNetwork) throw new Error('On-chain configuration network mismatch');
  const mode = sponsorshipMode(json);
  if (mode === 'direct') throw new Error('On-chain configuration does not enable sponsorship');
  const gasBudget = positive(json.gasBudget ?? requestedBudget ?? 50_000_000, 'gasBudget');
  const gasPrice = String(await client.getReferenceGasPrice());
  if (mode === 'gas-station') {
    const gs = json.gasStation as gasStationCfg;
    const endpoints = [[gs?.gasStation1URL, gs?.gasStation1Token], [gs?.gasStation2URL, gs?.gasStation2Token]];
    let last: unknown = new Error('Missing on-chain Gas Station configuration');
    for (const [url, token] of endpoints) {
      if (!url || !token) continue;
      try {
        const { result } = await post(`${url}/v1/reserve_gas`, token, { gas_budget: gasBudget, reserve_duration_secs: 60 });
        if (!result?.sponsor_address || !Array.isArray(result.gas_coins) || !result.gas_coins.length || !Number.isSafeInteger(result.reservation_id)) throw new Error('Invalid gas reservation');
        return { mode, network, configObjectId: loaded.objectId, sponsorAddress: result.sponsor_address, gasPayment: result.gas_coins.map((c: any) => ({ objectId: c.objectId, version: String(c.version), digest: c.digest })), gasBudget, gasPrice, reservationId: result.reservation_id, stationUrl: url, stationToken: token, release: () => {} };
      } catch (e) { last = e; }
    }
    throw last;
  }
  const aa = json.sponsorship.aa;
  if (!/^0x[0-9a-fA-F]{64}$/.test(aa?.sponsorAccountId ?? '') || !/^0x[0-9a-fA-F]{64}$/.test(aa?.packageId ?? '')) throw new Error('Missing or invalid on-chain AA account/package ID');
  const sponsorAddress = normalizeIotaAddress(aa.sponsorAccountId);
  const release = await acquire(`${network}:${sponsorAddress}`);
  try {
    const object = await client.getObject({ id: sponsorAddress, options: { showContent: true, showOwner: true } });
    const content = object.data?.content;
    if (content?.dataType !== 'moveObject' || content.type !== `${aa.typePackageId ?? aa.packageId}::sponsor::Sponsor` || !object.data?.owner || typeof object.data.owner !== 'object' || !('Shared' in object.data.owner)) throw new Error('Invalid AA sponsor account type/owner');
    const policy = content.fields as any;
    const system = await client.getLatestIotaSystemState();
    if (policy.enabled !== true || BigInt(system.epoch) > BigInt(policy.end_epoch)) throw new Error('AA sponsorship disabled or expired');
    if (BigInt(gasBudget) > BigInt(policy.max_gas_budget) || BigInt(gasPrice) > BigInt(policy.max_gas_price)) throw new Error('AA gas limits exceeded');
    let cursor: string | null | undefined;
    const candidates: any[] = [];
    do {
      const page = await client.getCoins({ owner: sponsorAddress, cursor, limit: 50 });
      candidates.push(...page.data.filter(c => BigInt(c.balance) >= BigInt(gasBudget)));
      cursor = page.hasNextPage ? page.nextCursor : null;
    } while (cursor);
    if (!candidates.length) throw new Error('AA sponsor has no sufficiently funded gas coin');
    const coin = candidates[Math.floor(Math.random() * candidates.length)];
    return { mode, network, configObjectId: loaded.objectId, sponsorAddress, gasPayment: [{ objectId: coin.coinObjectId, version: coin.version, digest: coin.digest }], gasBudget, gasPrice, aaPackageId: aa.packageId, release };
  } catch (e) { release(); throw e; }
}

export function applySponsorGas(tx: Transaction, gas: PreparedSponsorGas, sender: string) {
  tx.setSender(sender); tx.setGasOwner(gas.sponsorAddress); tx.setGasPayment(gas.gasPayment);
  tx.setGasBudget(gas.gasBudget); tx.setGasPrice(BigInt(gas.gasPrice));
}

export async function submitSponsoredBytes(client: IotaClient, gas: PreparedSponsorGas, bytes: Uint8Array, userSignatures: string[]): Promise<IotaTransactionBlockResponse> {
  let digest: string | undefined;
  try {
    const tx = Transaction.from(bytes);
    const data = tx.getData();
    const refs = (coins: any[] | null | undefined) => (coins ?? []).map(c => [normalizeIotaAddress(c.objectId), String(c.version), c.digest]);
    if (normalizeIotaAddress(data.gasData.owner ?? '') !== normalizeIotaAddress(gas.sponsorAddress) || String(data.gasData.budget) !== String(gas.gasBudget) || String(data.gasData.price) !== String(gas.gasPrice) || JSON.stringify(refs(data.gasData.payment)) !== JSON.stringify(refs(gas.gasPayment))) throw new Error('Signed transaction gas differs from prepared sponsorship');
    if (!userSignatures.length) throw new Error('Missing user signature');
    digest = await tx.getDigest();
    if (gas.mode === 'gas-station') {
      if (userSignatures.length !== 1) throw new Error('Gas Station requires one user signature');
      let s = ''; for (const b of bytes) s += String.fromCharCode(b);
      const response = await post(`${gas.stationUrl}/v1/execute_tx`, gas.stationToken!, { reservation_id: gas.reservationId, tx_bytes: btoa(s), user_sig: userSignatures[0] });
      if (response.effects?.transactionDigest !== digest) throw new Error('Gas Station returned a different transaction digest');
    } else {
      const auth = await new MoveAuthenticatorBuilder(gas.sponsorAddress).finish(client);
      const signature = await new MoveSigner(auth).getSignature();
      await client.executeTransactionBlock({ transactionBlock: bytes, signature: [...userSignatures, signature], options: { showEffects: true } });
    }
    const response = await client.waitForTransaction({ digest, options: { showEffects: true, showObjectChanges: true, showEvents: true, showInput: true, showRawInput: true, showBalanceChanges: true } });
    if (response.effects?.status.status !== 'success') throw Object.assign(new Error(response.effects?.status.error ?? 'Transaction execution failed'), { digest, response });
    return response;
  } catch (error) {
    // Preserve the digest for reconciliation. Never switch sponsor or replay here.
    if (error && typeof error === 'object' && digest) Object.assign(error, { digest });
    throw error;
  } finally { gas.release(); }
}
