import {createHash, createHmac, randomUUID} from 'node:crypto';
export const MAINNET_BASE_URL = 'https://partner-api.objectid.io';
export const TESTNET_BASE_URL = 'https://partner-api.objectid.io/testnet';
export function signRequest({secret, method, path, rawBody = '', timestamp = String(Math.floor(Date.now()/1000)), nonce = randomUUID()}) {
  const digest = createHash('sha256').update(rawBody).digest('hex');
  const canonical = [timestamp, nonce, method.toUpperCase(), path, digest].join('.');
  return {'x-timestamp':timestamp, 'x-nonce':nonce, 'x-signature':createHmac('sha256',secret).update(canonical).digest('hex')};
}
export function monthlyClient({partnerId, secret, network = 'testnet', fetchImpl = fetch}) {
  if (!['testnet','mainnet'].includes(network)) throw Error('Choose testnet or mainnet explicitly');
  const baseUrl = network === 'mainnet' ? MAINNET_BASE_URL : TESTNET_BASE_URL;
  if (!partnerId || !secret) throw Error('Server-side partner credentials required');
  async function request(method, path, payload) {
    const rawBody = payload === undefined ? '' : JSON.stringify(payload);
    const response = await fetchImpl(baseUrl + path, {
      method, redirect:'error', signal:AbortSignal.timeout(20000),
      headers:{'content-type':'application/json','x-partner-id':partnerId,...signRequest({secret,method,path,rawBody})},
      ...(payload === undefined ? {} : {body:rawBody})
    });
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = {error:'Non-JSON gateway response'}; }
    if (!response.ok) throw Object.assign(Error(data.error || 'ObjectID request failed'), {status:response.status,code:data.code,retryAfter:response.headers.get('retry-after')});
    return data;
  }
  return {
    allowance:()=>request('GET','/v1/credit-allowance'),
    status:requestId=>request('GET','/v1/credit-requests/'+encodeURIComponent(requestId)),
    reserve:({request_id,recipient_address,credit_amount})=>request('POST','/v1/credit-requests',{request_id,recipient_address,credit_amount})
  };
}
