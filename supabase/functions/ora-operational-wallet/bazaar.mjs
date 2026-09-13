// Only this registration is signable. No caller-supplied message, URL, price or account.
export const BAZAAR = Object.freeze({
  api: 'https://x402-api.onrender.com',
  url: 'https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-x402',
  ownerAddress: '0x89460d9e0590559e63860197dfe2ac648a753584',
  price: 0.40,
  name: 'ORUM — Internal State Reading (not market data)'
});
export async function registerBazaar({cdp,recoverMessageAddress,net=fetch,now=Date.now}) {
  const base={schema:'orum-bazaar-registration/v1',wallet:BAZAAR.ownerAddress,endpoint:BAZAAR.url,price_usdc:BAZAAR.price,funds_moved:false,financial_transaction_signed:false};
  const get=async url=>{
    const r=await net(url,{redirect:'error',signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw Error('observation_failed');return r.json();
  };
  const matches=s=>s?.url===BAZAAR.url && s?.owner_address?.toLowerCase()===BAZAAR.ownerAddress && Number(s?.price_usdc)===BAZAAR.price;
  let catalogue;
  try { catalogue=await get(BAZAAR.api+'/api/services?search=ORUM&limit=200'); }
  catch { return {...base,status:503,outcome:'catalogue_unavailable',message_signed:false,registration_submitted:false}; }
  const services=Array.isArray(catalogue)?catalogue:(catalogue.services||catalogue.data);
  if(!Array.isArray(services))throw Error('invalid_catalogue');
  const existing=services.find(s=>s.url===BAZAAR.url);
  if(existing)return {...base,status:matches(existing)?200:409,outcome:matches(existing)?'already_registered':'listing_conflict',service_id:existing.id,message_signed:false};
  const health=await get(BAZAAR.api+'/health');
  if(health.relay_configured!==true)return {...base,status:409,outcome:'relay_unavailable',message_signed:false};
  // Require the expected live upstream payment contract before listing it.
  const upstream=await net(BAZAAR.url,{redirect:'error',signal:AbortSignal.timeout(8000)});
  if(upstream.status!==402)throw Error('upstream_contract_changed');
  const header=upstream.headers.get('payment-required');
  const contract=header?JSON.parse(atob(header)):await upstream.json();
  const accept=contract.accepts?.find(a=>a.network==='eip155:8453');
  if(!accept || accept.amount!=='330000' || accept.scheme!=='exact' || accept.payTo?.toLowerCase()!=='0xfed69e8ee87a1f0fbbf8409ab654fc51832cdee5' || accept.asset?.toLowerCase()!=='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')throw Error('upstream_contract_changed');
  const account=await cdp.evm.getAccount({name:'orum-operational-v1'});
  if(account.name!=='orum-operational-v1'||account.address.toLowerCase()!==BAZAAR.ownerAddress)throw Error('account_identity_mismatch');
  const timestamp=now();
  const message=`quick-register:${BAZAAR.url}:${BAZAAR.ownerAddress}:${timestamp}`;
  const {signature}=await cdp.evm.signMessage({address:BAZAAR.ownerAddress,message});
  const recovered=await recoverMessageAddress({message,signature});
  if(recovered.toLowerCase()!==BAZAAR.ownerAddress)throw Error('signature_identity_mismatch');
  if(now()-timestamp>240000)throw Error('signature_expired');
  // Never return or log the authentication signature. Never retry this POST.
  let r,j;
  try {
    r=await net(BAZAAR.api+'/quick-register',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:BAZAAR.url,ownerAddress:BAZAAR.ownerAddress,price:BAZAAR.price,name:BAZAAR.name,timestamp,signature}),signal:AbortSignal.timeout(15000)});
    j=await r.json();
  } catch {return {...base,status:202,outcome:'registration_unknown',message_signed:true,signature_verified:true,retry_policy:'read catalogue before retry'};}
  if(!r.ok)return {...base,status:r.status,outcome:'registration_rejected',message_signed:true,signature_verified:true,registration_http_status:r.status,error_code:typeof j.error==='string'?j.error.slice(0,100):null,service_id:j.existing_service_id||null};
  const id=j.data?.id;
  if(!/^[0-9a-f-]{36}$/i.test(id||''))return {...base,status:202,outcome:'registration_unknown',message_signed:true,signature_verified:true};
  try {
    const observed=await get(BAZAAR.api+'/api/services/'+id);
    return {...base,status:matches(observed)?200:202,outcome:matches(observed)?'registration_verified':'registration_readback_mismatch',service_id:id,message_signed:true,signature_verified:true,service_status:observed.status||'unknown',payment_protocol:observed.payment_protocol||'unknown',paid_delivery_verified:false};
  } catch {return {...base,status:202,outcome:'registered_readback_pending',service_id:id,message_signed:true,signature_verified:true};}
}
