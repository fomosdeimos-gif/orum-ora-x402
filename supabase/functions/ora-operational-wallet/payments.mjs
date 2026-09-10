export const SOURCE='0x89460d9e0590559e63860197dfe2ac648A753584';
export const DESTINATION='0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
export const TOKEN='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const addressWord=a=>a.slice(2).toLowerCase().padStart(64,'0');
export const transferData=amount=>'0xa9059cbb'+addressWord(DESTINATION)+BigInt(amount).toString(16).padStart(64,'0');
const bytes=hex=>Uint8Array.from((hex.replace(/^0x/,'').match(/../g)||[]).map(v=>parseInt(v,16)));
const concat=(...arrays)=>Uint8Array.from(arrays.flatMap(a=>[...a]));
const integer=n=>{if(BigInt(n)===0n)return new Uint8Array();let h=BigInt(n).toString(16);return bytes(h.length%2?'0'+h:h);};
function rlp(value){
 const list=Array.isArray(value),payload=list?concat(...value.map(rlp)):value;
 if(!list&&payload.length===1&&payload[0]<128)return payload;
 const offset=list?192:128;
 return payload.length<56?concat(Uint8Array.of(offset+payload.length),payload):concat(Uint8Array.of(offset+55+integer(payload.length).length),integer(payload.length),payload);
}
export function serializeTransfer(amount,nonce,gas){
 const body=rlp([integer(8453),integer(nonce),integer(1000000),integer(100000000),integer(gas),bytes(TOKEN),integer(0),bytes(transferData(amount)),[]]);
 return '0x02'+[...body].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function paymentAction(body,{rpc,cdp,chainRpc}){
 const id=body.request_id;
 if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))return {status:400,error:'invalid_request_id'};
 if(await chainRpc('eth_chainId',[])!=='0x2105')return {status:503,error:'wrong_chain'};
 if(body.action==='payment_status'){
  const job=await rpc('ora_payment_job_v1',{p_id:id});
  if(!job)return {status:404,error:'request_not_found'};
  if(job.status!=='submitted'||!job.tx_hash)return {status:200,job};
  const receipt=await chainRpc('eth_getTransactionReceipt',[job.tx_hash]);
  if(!receipt)return {status:200,job,confirmation:'pending'};
  const tx=await chainRpc('eth_getTransactionByHash',[job.tx_hash]);
  if(!tx||tx.from?.toLowerCase()!==SOURCE.toLowerCase()||tx.to?.toLowerCase()!==TOKEN.toLowerCase()||tx.input?.toLowerCase()!==transferData(job.amount_atomic))return {status:503,error:'transaction_mismatch'};
  const head=BigInt(await chainRpc('eth_blockNumber',[]));
  const confirmations=head-BigInt(receipt.blockNumber)+1n;
  if(confirmations<12n)return {status:200,job,confirmations:confirmations.toString()};
  const transfer=receipt.logs?.some(log=>log.address?.toLowerCase()===TOKEN.toLowerCase()&&log.topics?.[0]===TRANSFER_TOPIC&&log.topics?.[1]?.toLowerCase()==='0x'+addressWord(SOURCE)&&log.topics?.[2]?.toLowerCase()==='0x'+addressWord(DESTINATION)&&BigInt(log.data)===BigInt(job.amount_atomic));
  const state=receipt.status==='0x0'?'reverted':receipt.status==='0x1'&&transfer?'confirmed':null;
  if(!state)return {status:503,error:'receipt_mismatch'};
  await rpc('ora_payment_result_v1',{p_id:id,p_status:state,p_tx:job.tx_hash});
  return {status:200,job:{...job,status:state},confirmations:confirmations.toString(),internal_transfer:true};
 }
 if(typeof body.amount_atomic!=='string'||!/^[1-9][0-9]{0,6}$/.test(body.amount_atomic)||BigInt(body.amount_atomic)>1000000n)return {status:400,error:'amount_must_be_1_to_1000000_atomic_usdc'};
 const old=await rpc('ora_payment_job_v1',{p_id:id});
 if(old)return old.amount_atomic===body.amount_atomic?{status:200,job:old,replayed:true}:{status:409,error:'idempotency_conflict'};
 const account=await cdp.evm.getAccount({name:'orum-operational-v1'});
 if(account.address.toLowerCase()!==SOURCE.toLowerCase())return {status:503,error:'source_mismatch'};
 const balance=BigInt(await chainRpc('eth_call',[{to:TOKEN,data:'0x70a08231'+addressWord(SOURCE)},'latest']));
 const eth=BigInt(await chainRpc('eth_getBalance',[SOURCE,'latest']));
 if(balance<BigInt(body.amount_atomic)||eth<20000000000000n)return {status:409,error:'insufficient_operational_funds',signed:false,submitted:false};
 if(BigInt(await chainRpc('eth_gasPrice',[]))>100000000n)return {status:409,error:'fee_per_gas_above_cap',signed:false};
 const gas=BigInt(await chainRpc('eth_estimateGas',[{from:SOURCE,to:TOKEN,value:'0x0',data:transferData(body.amount_atomic)}]));
 const gasLimit=(gas*120n+99n)/100n;
 if(gasLimit>100000n)return {status:409,error:'gas_limit_above_cap',signed:false};
 if(body.action==='preview_usdc')return {status:200,preview:true,source:SOURCE,destination:DESTINATION,amount_atomic:body.amount_atomic,gas_limit:gasLimit.toString(),signed:false,submitted:false,budget_reserved:false};
 // Atomically reserve the daily budget and prohibit any other in-flight request.
 const claim=await rpc('ora_payment_claim_v1',{p_id:id,p_amount:body.amount_atomic});
 if(!claim.claimed)return {status:409,...claim};
 let submittedHash=null;
 try{
  const nonce=BigInt(await chainRpc('eth_getTransactionCount',[SOURCE,'pending']));
  const sent=await cdp.evm.sendTransaction({address:SOURCE,network:'base',transaction:serializeTransfer(body.amount_atomic,nonce,gasLimit),idempotencyKey:id});
  if(!/^0x[0-9a-fA-F]{64}$/.test(sent.transactionHash))throw Error('invalid_submission');
  submittedHash=sent.transactionHash;
  await rpc('ora_payment_result_v1',{p_id:id,p_status:'submitted',p_tx:submittedHash});
  return {status:202,request_id:id,tx_hash:sent.transactionHash,state:'submitted_not_confirmed',internal_transfer:true};
 }catch{
  await rpc('ora_payment_result_v1',{p_id:id,p_status:'unknown',p_tx:submittedHash}).catch(()=>{});
  return {status:503,error:'submission_outcome_unknown',request_id:id,tx_hash:submittedHash,retry_allowed:false};
 }
}
