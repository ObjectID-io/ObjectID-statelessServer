import {monthlyClient} from './monthly-client.mjs';
const client=monthlyClient({partnerId:process.env.OBJECTID_PARTNER_ID,secret:process.env.OBJECTID_PARTNER_SECRET,network:process.env.OBJECTID_NETWORK||'testnet'});
const command=process.argv[2] || 'allowance';
try {
  let result;
  if(command==='allowance') result=await client.allowance();
  else if(command==='status') {
    if(!process.env.OBJECTID_REQUEST_ID) throw Error('Set OBJECTID_REQUEST_ID');
    result=await client.status(process.env.OBJECTID_REQUEST_ID);
  } else if(command==='request') {
    if(process.env.OBJECTID_NETWORK==='mainnet' && process.env.OBJECTID_ALLOW_MAINNET_REQUEST!=='true') throw Error('Real mainnet issuance requires OBJECTID_ALLOW_MAINNET_REQUEST=true');
    const credit_amount=Number(process.env.OBJECTID_CREDIT_AMOUNT);
    if(!process.env.OBJECTID_REQUEST_ID || !/^0x[0-9a-fA-F]{64}$/.test(process.env.OBJECTID_RECIPIENT || '') || !Number.isSafeInteger(credit_amount) || credit_amount<1 || credit_amount>1000000) throw Error('Set stable request ID, approved recipient and credit amount (1..1000000)');
    result=await client.reserve({request_id:process.env.OBJECTID_REQUEST_ID,recipient_address:process.env.OBJECTID_RECIPIENT,credit_amount});
  } else throw Error('Use allowance, request or status');
  console.log(JSON.stringify(result,null,2));
} catch(error) {
  console.error(JSON.stringify({error:error.message,status:error.status,code:error.code,retryAfter:error.retryAfter}));process.exitCode=1;
}
