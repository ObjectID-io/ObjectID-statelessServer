import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {monthlyClient,signRequest} from '../monthly-client.mjs';
import {verifyCallback} from '../verify-callback.mjs';
test('client signs the stripped path and exact sent bytes; retries retain business ID with fresh nonce',async()=>{
  const requests=[];
  const client=monthlyClient({partnerId:'example',secret:'offline-fixture',fetchImpl:async(url,options)=>{
    const path=new URL(url).pathname.replace(/^\/testnet/,'');
    const canonical=[options.headers['x-timestamp'],options.headers['x-nonce'],options.method,path,createHash('sha256').update(options.body||'').digest('hex')].join('.');
    assert.equal(options.headers['x-signature'],createHmac('sha256','offline-fixture').update(canonical).digest('hex'));
    requests.push({url,...options});return new Response(JSON.stringify({status:'pending'}),{status:202});
  }});
  const body={request_id:'SAVED-1',recipient_address:'0x'+'a'.repeat(64),credit_amount:1};
  await client.reserve(body);await client.reserve(body);await client.status('SAVED-1');await client.allowance();
  assert.equal(requests[0].body,requests[1].body);assert.notEqual(requests[0].headers['x-nonce'],requests[1].headers['x-nonce']);
  assert.equal(requests[2].body,undefined);assert.equal(requests[3].url,'https://partner-api.objectid.io/testnet/v1/credit-allowance');
});
test('canonical includes query string, uppercases method and hashes empty GET body',()=>{
  const a=signRequest({secret:'fixture',method:'get',path:'/v1/example?a=1',timestamp:'1000',nonce:'fixture-nonce'});
  const expected=createHmac('sha256','fixture').update('1000.fixture-nonce.GET./v1/example?a=1.e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855').digest('hex');
  assert.equal(a['x-signature'],expected);
});
test('429 retains retry-after; gateway HTML is handled without assuming JSON or retrying a write',async()=>{
  let calls=0;const client=monthlyClient({partnerId:'example',secret:'fixture',fetchImpl:async()=>{calls++;return new Response('gateway error',{status:429,headers:{'retry-after':'12'}});}});
  await assert.rejects(()=>client.allowance(),e=>e.status===429&&e.retryAfter==='12');assert.equal(calls,1);
});
test('callback verifies exact bytes, age, event ID and network; rejects tamper',()=>{
  const event={event_id:'fixture-event',event_type:'objectid.credit_request.resolved',network:'testnet',status:'succeeded'};
  const rawBody=Buffer.from(JSON.stringify(event)),secret='offline-callback-fixture';
  const headers={'x-objectid-timestamp':'1000','x-objectid-event-id':event.event_id,'x-objectid-signature':createHmac('sha256',secret).update('1000.').update(rawBody).digest('hex')};
  assert.deepEqual(verifyCallback({secret,rawBody,headers,nowSeconds:1000}),event);
  assert.throws(()=>verifyCallback({secret,rawBody:Buffer.concat([rawBody,Buffer.from(' ')]),headers,nowSeconds:1000}));
  assert.throws(()=>verifyCallback({secret,rawBody,headers,nowSeconds:1400}));
  assert.throws(()=>verifyCallback({secret,rawBody,headers:{...headers,'x-objectid-event-id':'wrong'},nowSeconds:1000}));
});
