export const BTC_DESTINATION='bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf';
export const BTC_POLICY={network:'bitcoin-mainnet',destination:BTC_DESTINATION,min_sats:546,max_sats:10000,max_daily_debit_sats:50000,max_fee_sats:1000,max_sat_per_vbyte:10,min_confirmations:6,max_inputs:5};
export const fromHex=h=>{if(typeof h!=='string'||!/^([a-f0-9]{2})+$/.test(h))throw Error('invalid_hex');return Uint8Array.from(h.match(/../g),x=>parseInt(x,16));};
export const toHex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ensure=(ok,code)=>{if(!ok)throw Error(code);};
// Fixed, independent Esplora providers. No caller-controlled URL or broadcast body.
export function bitcoinNetwork(fetcher=fetch){
 const hosts=['https://blockstream.info/api','https://mempool.space/api'];
 async function get(i,path,plain=false){
  const r=await fetcher(hosts[i]+path,{signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('bitcoin_observer_unavailable');
  const text=await r.text();ensure(text.length<=2000000,'bitcoin_response_too_large');return plain?text:JSON.parse(text);
 }
 return {get,broadcast:async raw=>{
  const r=await fetcher(hosts[0]+'/tx',{method:'POST',headers:{'Content-Type':'text/plain'},body:raw,signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('bitcoin_broadcast_uncertain');return (await r.text()).trim();
 }};
}
async function chainHeads(net){
 const genesis='000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
 const g=await Promise.all([net.get(0,'/block-height/0',true),net.get(1,'/block-height/0',true)]);
 ensure(g.every(x=>x.trim()===genesis),'bitcoin_wrong_network');
 const hs=await Promise.all([net.get(0,'/blocks/tip/height',true),net.get(1,'/blocks/tip/height',true)]);
 ensure(hs.every(x=>/^\d+$/.test(x.trim())),'bitcoin_invalid_height');
 const heads=hs.map(Number);ensure(Math.abs(heads[0]-heads[1])<=2,'bitcoin_observer_disagreement');return heads;
}
export async function observeBitcoin(address,net){
 const heads=await chainHeads(net);
 const lists=await Promise.all([0,1].map(i=>net.get(i,'/address/'+address+'/utxo')));
 function normalize(list){
  ensure(Array.isArray(list)&&list.length<=200,'bitcoin_utxo_limit');
  const items=list.map(u=>{ensure(/^[a-f0-9]{64}$/.test(u.txid)&&Number.isSafeInteger(u.vout)&&u.vout>=0&&Number.isSafeInteger(u.value)&&u.value>0,'bitcoin_invalid_utxo');return {txid:u.txid,vout:u.vout,value:u.value,confirmed:u.status?.confirmed===true,block_height:u.status?.block_height??null,block_hash:u.status?.block_hash??null};}).sort((a,b)=>a.txid.localeCompare(b.txid)||a.vout-b.vout);
  ensure(new Set(items.map(u=>u.txid+':'+u.vout)).size===items.length,'bitcoin_duplicate_utxo');return items;
 }
 const a=normalize(lists[0]),b=normalize(lists[1]);ensure(same(a,b),'bitcoin_observer_disagreement');
 const eligible=a.filter(u=>u.confirmed&&Number.isSafeInteger(u.block_height)&&Math.min(...heads)-u.block_height+1>=6);
 return {heads,utxos:a,eligible,total_sats:a.reduce((n,u)=>n+BigInt(u.value),0n).toString(),spendable_sats:eligible.reduce((n,u)=>n+BigInt(u.value),0n).toString()};
}
// Conservative P2WPKH upper bound: 11 overhead + 69/input + 31/output vbytes.
export function selectBitcoin(utxos,amount,rate){
 const chosen=[];let sum=0n;
 for(const u of [...utxos].sort((a,b)=>b.value-a.value||a.txid.localeCompare(b.txid)||a.vout-b.vout).slice(0,5)){
  chosen.push(u);sum+=BigInt(u.value);
  const withChange=BigInt(Math.ceil((11+69*chosen.length+62)*rate));
  if(sum>=amount+withChange+546n){ensure(withChange<=1000n,'bitcoin_fee_cap');return {chosen,fee:withChange,change:sum-amount-withChange};}
  const minimum=BigInt(Math.ceil((11+69*chosen.length+31)*rate));
  if(sum>=amount+minimum&&sum-amount<=1000n)return {chosen,fee:sum-amount,change:0n};
 }
 throw Error('bitcoin_insufficient_confirmed_funds');
}
export function constructBitcoin(btc,wallet,selection,amount){
 const tx=new btc.Transaction({version:2,lockTime:0});
 const script=btc.p2wpkh(fromHex(wallet.public_key)).script;
 for(const u of selection.chosen)tx.addInput({txid:u.txid,index:u.vout,sequence:0xffffffff,witnessUtxo:{script,amount:BigInt(u.value)}});
 tx.addOutputAddress(BTC_DESTINATION,amount);
 if(selection.change>0n)tx.addOutputAddress(wallet.address,selection.change);
 ensure(tx.fee===selection.fee,'bitcoin_fee_mismatch');return tx;
}
async function validateInputs(btc,wallet,selection,net){
 const expected=toHex(btc.p2wpkh(fromHex(wallet.public_key)).script);
 await Promise.all(selection.chosen.map(async u=>{
  const [raw0,raw1,spent0,spent1,hash0,hash1]=await Promise.all([net.get(0,'/tx/'+u.txid+'/hex',true),net.get(1,'/tx/'+u.txid+'/hex',true),net.get(0,'/tx/'+u.txid+'/outspend/'+u.vout),net.get(1,'/tx/'+u.txid+'/outspend/'+u.vout),net.get(0,'/block-height/'+u.block_height,true),net.get(1,'/block-height/'+u.block_height,true)]);
  ensure(raw0===raw1&&spent0.spent===false&&spent1.spent===false&&hash0.trim()===u.block_hash&&hash1.trim()===u.block_hash,'bitcoin_input_disagreement');
  const prev=btc.Transaction.fromRaw(fromHex(raw0.trim()),{allowUnknownInputs:true,allowUnknownOutputs:true});
  ensure(prev.id===u.txid,'bitcoin_prevout_hash_mismatch');const output=prev.getOutput(u.vout);
  ensure(output.amount===BigInt(u.value)&&toHex(output.script)===expected,'bitcoin_prevout_mismatch');
 }));
}
async function reconcileBitcoin(body,{rpc,net,btc}){
 const job=await rpc('ora_btc_job_v1',{p_id:body.request_id});if(!job)return {status:404,error:'bitcoin_request_not_found'};
 if(!job.txid||job.status==='confirmed')return {status:200,job};
 const heads=await chainHeads(net);
 const statuses=await Promise.all([0,1].map(i=>net.get(i,'/tx/'+job.txid+'/status')));
 if(!statuses.every(s=>s.confirmed===true))return {status:200,job,confirmation:'not_confirmed_by_both'};
 ensure(statuses[0].block_hash===statuses[1].block_hash&&statuses[0].block_height===statuses[1].block_height,'bitcoin_confirmation_disagreement');
 const block=statuses[0].block_height;ensure(Number.isSafeInteger(block),'bitcoin_invalid_height');
 const confirmations=Math.min(...heads)-block+1;if(confirmations<6)return {status:200,job,confirmations};
 const hashes=await Promise.all([0,1].map(i=>net.get(i,'/block-height/'+block,true)));
 ensure(hashes.every(h=>h.trim()===statuses[0].block_hash),'bitcoin_confirmation_reorg');
 const raws=await Promise.all([0,1].map(i=>net.get(i,'/tx/'+job.txid+'/hex',true)));ensure(raws[0]===raws[1],'bitcoin_transaction_disagreement');
 const tx=btc.Transaction.fromRaw(fromHex(raws[0].trim()));ensure(tx.id===job.txid&&tx.getOutputAddress(0)===BTC_DESTINATION&&tx.getOutput(0).amount===BigInt(job.amount_sats),'bitcoin_receipt_mismatch');
 const result=await rpc('ora_btc_result_v1',{p_id:body.request_id,p_status:'confirmed'});return {status:200,job:result,confirmations,internal_transfer:true};
}
export function bitcoinHandler({btc,pubECDSA}){
 return async function bitcoinAction(body,{rpc,net}){
  try{
   if(!['btc_create','btc_observe','btc_preview','btc_send','btc_status'].includes(body.action))return {status:400,error:'invalid_bitcoin_action'};
   if(!['btc_create','btc_observe'].includes(body.action)&&!(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(body.request_id||'')))return {status:400,error:'invalid_request_id'};
   if(body.action==='btc_status')return await reconcileBitcoin(body,{rpc,net,btc});
   let wallet=await rpc('ora_btc_wallet_v1',{});
   if(body.action==='btc_create'){
    const privateHex=await rpc('ora_btc_key_v1',{}),key=fromHex(privateHex);
    try{const publicKey=pubECDSA(key,true),payment=btc.p2wpkh(publicKey);wallet=await rpc('ora_btc_wallet_v1',{p_address:payment.address,p_public_key:toHex(publicKey)});}finally{key.fill(0);}
   }
   if(!wallet)return {status:404,error:'bitcoin_wallet_not_initialized'};
   ensure(btc.p2wpkh(fromHex(wallet.public_key)).address===wallet.address,'bitcoin_wallet_identity_mismatch');
   if(['btc_create','btc_observe'].includes(body.action)){
    let observation;try{const o=await observeBitcoin(wallet.address,net);observation={state:'two_observers_agree',heads:o.heads,total_sats:o.total_sats,spendable_sats:o.spendable_sats};}catch{observation={state:'unavailable'};}
    return {status:200,wallet,policy:BTC_POLICY,observation,signing_implemented:true,financial_transaction_signed:false,funds_sent:false,custody:'Supabase Vault hot wallet in user project; not an HSM; no independent recovery backup verified'};
   }
   ensure(typeof body.amount_sats==='string'&&/^[1-9][0-9]{0,4}$/.test(body.amount_sats),'bitcoin_invalid_amount');
   const amount=BigInt(body.amount_sats);ensure(amount>=546n&&amount<=10000n,'bitcoin_amount_cap');
   const old=await rpc('ora_btc_job_v1',{p_id:body.request_id});if(old)return old.amount_sats===body.amount_sats?{status:200,job:old,replayed:true}:{status:409,error:'bitcoin_idempotency_conflict'};
   const observation=await observeBitcoin(wallet.address,net);
   if(BigInt(observation.spendable_sats)<amount+1n)return {status:409,error:'bitcoin_insufficient_confirmed_funds',signed:false,submitted:false};
   const fees=await Promise.all([0,1].map(i=>net.get(i,'/fee-estimates')));
   const rate=Math.ceil(Math.max(1,...fees.map(f=>Number(f['6']))));ensure(Number.isFinite(rate)&&rate<=10,'bitcoin_fee_rate_cap');
   const selection=selectBitcoin(observation.eligible,amount,rate);
   await validateInputs(btc,wallet,selection,net);
   const tx=constructBitcoin(btc,wallet,selection,amount);
   if(body.action==='btc_preview')return {status:200,preview:true,address:wallet.address,destination:BTC_DESTINATION,amount_sats:body.amount_sats,fee_sats:selection.fee.toString(),change_sats:selection.change.toString(),signed:false,submitted:false};
   const claim=await rpc('ora_btc_claim_v1',{p_id:body.request_id,p_amount:body.amount_sats,p_fee:selection.fee.toString()});if(!claim.claimed)return {status:409,...claim};
   let txid=null;
   try{
    const key=fromHex(await rpc('ora_btc_key_v1',{}));
    try{ensure(toHex(pubECDSA(key,true))===wallet.public_key,'bitcoin_signer_identity_mismatch');tx.sign(key);tx.finalize();}finally{key.fill(0);}
    ensure(tx.isFinal&&tx.fee<=1000n&&Number(tx.fee)/tx.vsize<=10&&Number(tx.fee)/tx.vsize>=rate,'bitcoin_signed_fee_check');
    txid=tx.id;
    // Persist exact signed bytes BEFORE any broadcast. A DB failure never causes a blind retry.
    const stored=await rpc('ora_btc_signed_v1',{p_id:body.request_id,p_txid:txid,p_rawtx:tx.hex});ensure(stored.txid===txid&&stored.status==='signed','bitcoin_signed_record_mismatch');
    const broadcastId=await net.broadcast(tx.hex);ensure(broadcastId===txid,'bitcoin_broadcast_id_mismatch');
    await rpc('ora_btc_result_v1',{p_id:body.request_id,p_status:'submitted'});
    return {status:202,request_id:body.request_id,txid,state:'submitted_not_confirmed',internal_transfer:true};
   }catch{
    await rpc('ora_btc_result_v1',{p_id:body.request_id,p_status:'unknown'}).catch(()=>{});
    return {status:503,error:'bitcoin_outcome_unknown',request_id:body.request_id,txid,retry_allowed:false};
   }
  }catch(e){const known=/^bitcoin_[a-z_]+$/.test(e?.message||'');return {status:503,error:known?e.message:'bitcoin_operation_failed',funds_sent_by_this_error_handler:false};}
 };
}
