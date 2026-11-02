const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { Transaction } = require('@iota/iota-sdk/transactions');
const { Ed25519Keypair } = require('@iota/iota-sdk/keypairs/ed25519');
const { parseSerializedSignature } = require('@iota/iota-sdk/cryptography');
const { sponsorshipMode, prepareSponsoredGas, applySponsorGas, submitSponsoredBytes } = require('../dist/utils/sponsorship');
const { executeConfiguredTransaction, singAndExecTx } = require('../dist/utils/signAndExecTx');
const { buildCreateIdentityTx, buildProposeUpdateTx, buildExecuteUpdateTx } = require('../dist/utils/identityTransactions');
const addr = n => '0x' + n.padStart(64, '0');
const sponsor = addr('55'), pkg = addr('66');
const payment = [{ objectId: addr('77'), version: '1', digest: '11111111111111111111111111111111' }, { objectId: addr('88'), version: '2', digest: '11111111111111111111111111111111' }];
const gs = { gasStation1URL: 'https://one.invalid', gasStation1Token: 'fixture-one', gasStation2URL: 'https://two.invalid', gasStation2Token: 'fixture-two' };
let config, calls, configReads;
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
function setup(mode = 'gas-station') {
  config = { network: 'testnet', useGasStation: true, gasBudget: '20_000_000', gasStation: gs, sponsorship: { mode, aa: { sponsorAccountId: sponsor, packageId: pkg } } };
  calls = []; configReads = 0;
  global.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).endsWith('/v1/reserve_gas')) {
      assert.equal(JSON.parse(init.body).gas_budget, 20000000);
      return Response.json({ result: { sponsor_address: sponsor, reservation_id: 18, gas_coins: payment } });
    }
    throw new Error('submit response lost');
  };
}
function client(overrides = {}) {
  return {
    getReferenceGasPrice: async () => 1000n,
    getLatestIotaSystemState: async () => ({ epoch: '10' }),
    getCoins: async () => ({ data: [{ coinObjectId: payment[0].objectId, version: '1', digest: payment[0].digest, balance: '1000000000' }], hasNextPage: false }),
    getObject: async ({ id }) => {
      if (id !== sponsor) { configReads++; return { data: { content: { fields: { json: Array.from(Buffer.from(JSON.stringify(config))) } } } }; }
      return { data: { objectId: sponsor, version: '1', digest: payment[0].digest, owner: { Shared: { initial_shared_version: '1' } }, content: { dataType: 'moveObject', type: pkg + '::sponsor::Sponsor', fields: { enabled: true, end_epoch: '100', max_gas_budget: '100000000', max_gas_price: '5000' } } } };
    },
    executeTransactionBlock: async () => ({}),
    signAndExecuteTransaction: async () => { throw Error('must not spend sender gas'); },
    waitForTransaction: async ({ digest }) => ({ digest, effects: { transactionDigest: digest, status: { status: 'success' } } }),
    ...overrides,
  };
}
async function signed(c, gas) {
  const key = new Ed25519Keypair();
  const tx = buildCreateIdentityTx(Uint8Array.of(1, 2), pkg);
  applySponsorGas(tx, gas, key.toIotaAddress());
  const bytes = await tx.build({ client: c });
  return { bytes, signature: (await key.signTransaction(bytes)).signature };
}

test('selector honors explicit mode, legacy config and rejects malformed mode', () => {
  assert.equal(sponsorshipMode({ useGasStation: true }), 'gas-station');
  assert.equal(sponsorshipMode({ useGasStation: false }), 'direct');
  assert.equal(sponsorshipMode({ useGasStation: true, sponsorship: { mode: 'aa-onchain' } }), 'aa-onchain');
  for (const sponsorship of [null, {}, { mode: 'typo' }]) assert.throws(() => sponsorshipMode({ sponsorship }));
});
for (const fallback of [false, true]) test('GS retains every reserved payment coin: fallback=' + fallback, async () => {
  setup(); const fetch = global.fetch;
  global.fetch = async (url, init) => fallback && String(url).startsWith(gs.gasStation1URL) ? new Response('offline', { status: 503 }) : fetch(url, init);
  const gas = await prepareSponsoredGas(client(), 'testnet');
  assert.equal(gas.stationUrl, fallback ? gs.gasStation2URL : gs.gasStation1URL);
  assert.deepEqual(gas.gasPayment, payment); gas.release();
});
test('public mode refreshes between calls and parses configured budget separators', async () => {
  setup(); const c = client(); const first = await prepareSponsoredGas(c, 'testnet', 50000000);
  assert.equal(first.mode, 'gas-station'); assert.equal(first.gasBudget, 20000000); first.release();
  config.sponsorship.mode = 'aa-onchain'; const next = await prepareSponsoredGas(c, 'testnet');
  assert.equal(next.mode, 'aa-onchain'); next.release(); assert.equal(configReads, 2);
});
test('lost GS execute response keeps digest without second submission', async () => {
  setup(); const c = client(), gas = await prepareSponsoredGas(c, 'testnet'), s = await signed(c, gas);
  await assert.rejects(submitSponsoredBytes(c, gas, s.bytes, [s.signature]), e => Boolean(e.digest));
  assert.equal(calls.filter(u => u.endsWith('/v1/execute_tx')).length, 1);
  assert.equal(calls.some(u => u.startsWith(gs.gasStation2URL)), false);
});
test('AA signs unchanged bytes with Ed25519 and MoveAuthenticator and avoids GS', async () => {
  setup('aa-onchain'); let submitted;
  const c = client({ executeTransactionBlock: async input => { submitted = input; } });
  const gas = await prepareSponsoredGas(c, 'testnet'), s = await signed(c, gas);
  await submitSponsoredBytes(c, gas, s.bytes, [s.signature]);
  assert.deepEqual(submitted.transactionBlock, s.bytes); assert.equal(submitted.signature[0], s.signature);
  assert.equal(submitted.signature.length, 2);
  assert.equal(parseSerializedSignature(submitted.signature[1]).signatureScheme, 'MoveAuthenticator');
  assert.equal(calls.length, 0);
});
test('AA validates signed gas before submitting', async () => {
  setup('aa-onchain'); let submits = 0;
  const c = client({ executeTransactionBlock: async () => { submits++; } });
  const gas = await prepareSponsoredGas(c, 'testnet'), s = await signed(c, gas);
  const tx = Transaction.from(s.bytes); tx.setGasBudget(19000000);
  await assert.rejects(submitSponsoredBytes(c, gas, await tx.build({ client: c }), [s.signature]), /differs/);
  assert.equal(submits, 0);
});
for (const [field, value, pattern] of [['enabled', false, /disabled/], ['end_epoch', '9', /expired/], ['max_gas_budget', '100', /limits/], ['max_gas_price', '999', /limits/]]) test('AA rejects policy ' + field + ' and releases queue', async () => {
  setup('aa-onchain'); const c = client(), get = c.getObject;
  c.getObject = async input => { const result = await get(input); if (input.id === sponsor) result.data.content.fields[field] = value; return result; };
  await assert.rejects(prepareSponsoredGas(c, 'testnet'), pattern);
  c.getObject = get; const gas = await prepareSponsoredGas(c, 'testnet'); gas.release();
});
test('empty sponsor balance never falls back to GS or sender funds', async () => {
  setup('aa-onchain');
  await assert.rejects(executeConfiguredTransaction('testnet', client({ getCoins: async () => ({ data: [], hasNextPage: false }) }), new Ed25519Keypair(), new Transaction()), /funded/);
  assert.equal(calls.length, 0);
});
test('rejects network mismatch and invalid budget before any reservation', async () => {
  setup(); config.network = 'mainnet'; await assert.rejects(prepareSponsoredGas(client(), 'testnet'), /mismatch/);
  config.network = 'testnet'; config.gasBudget = '0'; await assert.rejects(prepareSponsoredGas(client(), 'testnet'), /gasBudget/);
  assert.equal(calls.length, 0);
});
test('failed Move execution returns its digest and no success callback', async () => {
  setup('aa-onchain'); let success = 0, errors = 0, settled = 0;
  const c = client({ waitForTransaction: async ({ digest }) => ({ digest, effects: { status: { status: 'failure', error: 'MoveAbort' } } }) });
  const result = await singAndExecTx('testnet', c, gs, false, new Ed25519Keypair(), buildCreateIdentityTx(Uint8Array.of(1), pkg), {
    onSuccess: () => { success++; }, onError: e => { errors++; assert.match(e.message, /MoveAbort/); assert.ok(e.digest); }, onSettled: () => { settled++; },
  });
  assert.equal(result.success, false); assert.equal(success, 0); assert.equal(errors, 1); assert.equal(settled, 1);
});
test('config read failure and malformed mode do not spend sender funds', async () => {
  setup(); config.sponsorship.mode = 'invalid';
  await assert.rejects(executeConfiguredTransaction('testnet', client(), new Ed25519Keypair(), new Transaction()), /Invalid/);
  await assert.rejects(executeConfiguredTransaction('testnet', client({ getObject: async () => { throw Error('RPC down'); } }), new Ed25519Keypair(), new Transaction()), /RPC down/);
});
test('Identity create/propose/execute builders preserve ControllerCap borrowing and have no gas placeholders', async () => {
  const shared = { objectId: addr('12'), initialSharedVersion: '1', mutable: true };
  const cap = { objectId: addr('13'), version: '2', digest: payment[0].digest };
  const transactions = [buildCreateIdentityTx(Uint8Array.of(1, 2), pkg), buildProposeUpdateTx(shared, cap, Uint8Array.of(1, 2), pkg), buildExecuteUpdateTx(shared, cap, addr('14'), pkg)];
  for (const [index, tx] of transactions.entries()) {
    const data = tx.getData(); assert.equal(data.sender, null); assert.equal(data.gasData.owner, null);
    const commands = data.commands.map(c => c.MoveCall.function);
    assert.deepEqual(commands, index === 0 ? ['new'] : ['borrow', index === 1 ? 'propose_update' : 'execute_update', 'put_back']);
    const bytes = await tx.build({ onlyTransactionKind: true });
    const restored = Transaction.fromKind(bytes); assert.deepEqual(await restored.build({ onlyTransactionKind: true }), bytes);
  }
});
test('Identity wasm loads, creates document and packs it with upgraded dependencies', async () => {
  const { Storage, JwkMemStore, KeyIdMemStore } = require('@iota/identity-wasm/node');
  const { createDocumentForNetworkUsingKeyPair } = require('../dist/utils/IdentityUtils');
  const [doc] = await createDocumentForNetworkUsingKeyPair(new Storage(new JwkMemStore(), new KeyIdMemStore()), 'testnet', new Ed25519Keypair());
  assert.match(doc.id().toString(), /^did:iota:testnet:/); assert.ok(doc.pack().length);
  assert.ok((await buildCreateIdentityTx(doc.pack(), pkg).build({ onlyTransactionKind: true })).length);
});

test('callback errors do not replay a successful sponsored transaction', async () => {
  setup('aa-onchain'); let submits = 0, errors = 0, settled = 0;
  const c = client({ executeTransactionBlock: async () => { submits++; } });
  await assert.rejects(singAndExecTx('testnet', c, gs, true, new Ed25519Keypair(), buildCreateIdentityTx(Uint8Array.of(1), pkg), {
    onSuccess: () => { throw Error('callback failed'); }, onError: () => { errors++; }, onSettled: () => { settled++; },
  }), /callback failed/);
  assert.equal(submits, 1); assert.equal(errors, 0); assert.equal(settled, 1);
});
test('sender payment requires explicit public useGasStation=false', async () => {
  setup(); delete config.sponsorship; delete config.useGasStation;
  await assert.rejects(executeConfiguredTransaction('testnet', client(), new Ed25519Keypair(), new Transaction()), /Missing/);
  config.useGasStation = false; let paid = 0;
  const result = await executeConfiguredTransaction('testnet', client({ signAndExecuteTransaction: async () => { paid++; return { digest: 'direct-fixture' }; } }), new Ed25519Keypair(), new Transaction());
  assert.equal(paid, 1); assert.equal(result.digest, 'direct-fixture'); assert.equal(calls.length, 0);
});
test('AA serialization holds coin allocation until release and releases after build errors', async () => {
  setup('aa-onchain'); const c = client(); const first = await prepareSponsoredGas(c, 'testnet');
  let allocated = false; const secondPromise = prepareSponsoredGas(c, 'testnet').then(gas => { allocated = true; return gas; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(allocated, false);
  first.release(); (await secondPromise).release();
  const badTx = new Transaction(); badTx.build = async () => { throw Error('build failed'); };
  await assert.rejects(executeConfiguredTransaction('testnet', c, new Ed25519Keypair(), badTx), /build failed/);
  const next = await prepareSponsoredGas(c, 'testnet'); next.release();
});
