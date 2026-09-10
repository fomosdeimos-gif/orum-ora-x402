import assert from 'node:assert/strict';
import {paymentAction,SOURCE,DESTINATION,TOKEN,serializeTransfer,transferData} from '../supabase/functions/ora-operational-wallet/payments.mjs';
import {handler} from '../supabase/functions/ora-operational-wallet/core.mjs';
const id='ac153211-4c87-47b7-8516-3256d6b70001',hash='0x'+'a'.repeat(64);
let job=null,claims=0,sends=0,balance=10000000n,eth=100000000000000n,wrongChain=false,fail=false,receipt=null,tx=null;
const rpc=async(name,args)=>{
 if(name==='ora_payment_job_v1')return job;
 if(name==='ora_payment_claim_v1'){claims++;if(job)return {claimed:false};job={id,amount_atomic:args.p_amount,status:'reserved',tx_hash:null};return {claimed:true};}
 if(name==='ora_payment_result_v1'){job={...job,status:args.p_status,tx_hash:args.p_tx};return job;}
 throw Error('unexpected RPC');
};
const chainRpc=async(method)=>({eth_chainId:wrongChain?'0x1':'0x2105',eth_call:'0x'+balance.toString(16),eth_getBalance:'0x'+eth.toString(16),eth_gasPrice:'0x1',eth_estimateGas:'0xea60',eth_getTransactionCount:'0x0',eth_getTransactionReceipt:receipt,eth_getTransactionByHash:tx,eth_blockNumber:'0x20'})[method];
const cdp={evm:{getAccount:async()=>({address:SOURCE}),sendTransaction:async(args)=>{sends++;assert.equal(args.address,SOURCE);assert.equal(args.network,'base');assert.equal(args.idempotencyKey,id);if(fail)throw Error('provider secret must not escape');return {transactionHash:hash};}}};
const run=(action='transfer_usdc',amount_atomic='1000000')=>paymentAction({action,amount_atomic,request_id:id},{rpc,cdp,chainRpc});
assert.equal((await run('transfer_usdc','1000001')).status,400);assert.equal(sends,0);
wrongChain=true;assert.equal((await run()).error,'wrong_chain');wrongChain=false;
balance=0n;assert.equal((await run()).error,'insufficient_operational_funds');assert.equal(claims,0);balance=10000000n;
assert.equal((await run('preview_usdc')).signed,false);assert.equal(claims,0);assert.equal(sends,0);
assert.equal((await run()).status,202);assert.equal(sends,1);
assert.equal((await run()).replayed,true);assert.equal(sends,1);
assert.equal((await run('transfer_usdc','1')).error,'idempotency_conflict');assert.equal(sends,1);
assert.equal((await run('payment_status')).confirmation,'pending');
tx={from:SOURCE,to:TOKEN,input:transferData('1000000')};
receipt={status:'0x1',blockNumber:'0x10',logs:[]};
assert.equal((await run('payment_status')).error,'receipt_mismatch');assert.equal(job.status,'submitted');
const word=a=>'0x'+a.slice(2).toLowerCase().padStart(64,'0');
receipt.logs=[{address:TOKEN,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',word(SOURCE),word(DESTINATION)],data:'0x'+(1000000).toString(16)}];
assert.equal((await run('payment_status')).job.status,'confirmed');
job=null;fail=true;assert.equal((await run()).error,'submission_outcome_unknown');assert.equal(job.status,'unknown');
const after=sends;assert.equal((await run()).replayed,true);assert.equal(sends,after);
let secretReads=0;
const route=handler({rpc:async n=>{if(n==='ora_operational_wallet_auth_v1')return true;secretReads++;throw Error('no secret reads permitted');},makeClient:()=>{throw Error('no client');},chainRpc});
const req=body=>new Request('https://invalid',{method:'POST',headers:{authorization:'Bearer '+'a'.repeat(64)},body:JSON.stringify(body)});
const btc=await(await route(req({action:'receive_btc'}))).json();assert.equal(btc.address,'bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf');assert.equal(btc.bitcoin_signing_available,false);assert.equal(secretReads,0);
assert.equal((await route(req({action:'transfer_usdc',request_id:id,amount_atomic:'1',destination:SOURCE}))).status,400);assert.equal(secretReads,0);
// Optional independent standard implementation, installed only in scratch for verification.
if(process.env.ORUM_VIEM_MODULE){
 const {parseTransaction,serializeTransaction,encodeFunctionData}=await import(process.env.ORUM_VIEM_MODULE);
 const serialized=serializeTransfer('1000000',0n,72000n),decoded=parseTransaction(serialized);
 assert.equal(decoded.chainId,8453);assert.equal(decoded.to.toLowerCase(),TOKEN.toLowerCase());assert.equal(decoded.value??0n,0n);assert.equal(decoded.nonce??0,0);assert.equal(decoded.gas,72000n);assert.equal(decoded.maxFeePerGas,100000000n);
 const data=encodeFunctionData({abi:[{name:'transfer',type:'function',inputs:[{type:'address',name:'to'},{type:'uint256',name:'amount'}],outputs:[{type:'bool'}],stateMutability:'nonpayable'}],functionName:'transfer',args:[DESTINATION,1000000n]});
 assert.equal(decoded.data,data);assert.equal(serializeTransaction({...decoded,type:'eip1559'}),serialized);
 console.log('PASS: unsigned EIP-1559 serialization and ERC20 calldata independently checked with viem.');
}
console.log('PASS: fixed destination, caps, preview without reservation/signing, replay/conflict, receipt proof, ambiguous outcome freeze, authenticated BTC receiving without key access. Mocked financial provider only.');
