import {createHmac,timingSafeEqual} from 'node:crypto';
// Pass the exact raw body Buffer, before JSON parsing. Durable deduplication is
// the caller's responsibility; this helper only verifies and validates an event.
export function verifyCallback({secret,rawBody,headers,nowSeconds=Math.floor(Date.now()/1000)}) {
  const timestamp=headers['x-objectid-timestamp'],signature=headers['x-objectid-signature'],eventId=headers['x-objectid-event-id'];
  if(!secret || !Buffer.isBuffer(rawBody) || rawBody.length>65536 || !/^\d+$/.test(timestamp || '') || !Number.isSafeInteger(Number(timestamp)) || Math.abs(nowSeconds-Number(timestamp))>300 || !/^[a-f0-9]{64}$/.test(signature || '')) throw Error('Invalid callback authentication');
  const expected=createHmac('sha256',secret).update(timestamp+'.').update(rawBody).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature,'hex'))) throw Error('Invalid callback signature');
  const event=JSON.parse(rawBody.toString('utf8'));
  if(!eventId || event.event_id!==eventId || event.event_type!=='objectid.credit_request.resolved' || event.network!=='testnet' || !['succeeded','failed'].includes(event.status)) throw Error('Unexpected monthly credit event');
  return event;
}
