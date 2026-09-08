const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { reserveGas } = require('../dist/utils/signAndExecTx.js');
for (const fallback of [false, true]) {
  test(`preserves every reserved gas coin (${fallback ? 'fallback' : 'primary'})`, async () => {
    const original = axios.post;
    let calls = 0;
    axios.post = async (_url, request) => {
      assert.equal(request.gas_budget, 50000000);
      if (++calls === 1 && fallback) throw new Error('Unavailable');
      return { data: { result: { sponsor_address: 'sponsor', reservation_id: 18,
        gas_coins: [{ objectId: 'coin-one', version: 1, digest: 'digest-one' }, { objectId: 'coin-two', version: 2, digest: 'digest-two' }] } } };
    };
    try {
      const result = await reserveGas(50000000, { gasStation1URL: 'https://one.test', gasStation1Token: '', gasStation2URL: 'https://two.test', gasStation2Token: '' });
      assert.equal(result.gas_coins.length, 2);
      assert.deepEqual(result.gas_coins.map(c => c.version), ['1', '2']);
      assert.deepEqual(result.gas_coins.map(c => c.objectId), ['coin-one', 'coin-two']);
    } finally { axios.post = original; }
  });
}
