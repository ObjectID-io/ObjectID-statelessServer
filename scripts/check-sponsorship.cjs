// Read-only RPC and dry-run checks. Never signs or submits transactions.
const { IotaClient, getFullnodeUrl } = require('@iota/iota-sdk/client');
const { Ed25519Keypair } = require('@iota/iota-sdk/keypairs/ed25519');
const { Storage, JwkMemStore, KeyIdMemStore } = require('@iota/identity-wasm/node');
const { loadPublicOnChainConfig } = require('../dist/utils/onchainConfig');
const { sponsorshipMode, prepareSponsoredGas, applySponsorGas } = require('../dist/utils/sponsorship');
const { createDocumentForNetworkUsingKeyPair } = require('../dist/utils/IdentityUtils');
const { buildCreateIdentityTx } = require('../dist/utils/identityTransactions');
(async () => {
  for (const network of ['testnet', 'mainnet']) {
    const client = new IotaClient({ url: getFullnodeUrl(network) });
    const loaded = await loadPublicOnChainConfig(network, client);
    const mode = sponsorshipMode(loaded.json);
    if (mode !== 'aa-onchain') throw Error(network + ': AA is not selected; refusing GS reservations in read-only check');
    const gas = await prepareSponsoredGas(client, network, undefined, loaded);
    try {
      const key = new Ed25519Keypair(); // Ephemeral key, only used to build a document. Never signs a transaction.
      const [doc] = await createDocumentForNetworkUsingKeyPair(new Storage(new JwkMemStore(), new KeyIdMemStore()), network === 'mainnet' ? 'iota' : network, key);
      const tx = buildCreateIdentityTx(doc.pack(), loaded.json.IOTAidentityPackage);
      applySponsorGas(tx, gas, key.toIotaAddress());
      const bytes = await tx.build({ client });
      const result = await client.dryRunTransactionBlock({ transactionBlock: bytes });
      if (result.effects.status.status !== 'success') throw Error(network + ': ' + result.effects.status.error);
      console.log(JSON.stringify({ network, configObjectId: loaded.objectId, mode, sponsorAccountId: gas.sponsorAddress, gasBudget: gas.gasBudget, identityPackage: loaded.json.IOTAidentityPackage, identityCreateDryRun: result.effects.status.status }));
    } finally { gas.release(); }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
