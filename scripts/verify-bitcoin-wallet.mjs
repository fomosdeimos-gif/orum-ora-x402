import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {bitcoinHandler,BTC_DESTINATION,fromHex,toHex,selectBitcoin} from '../supabase/functions/ora-operational-wallet/bitcoin.mjs';
import {handler} from '../supabase/functions/ora-operational-wallet/core.mjs';
const require=createRequire(process.env.ORUM_BTC_DEPENDENCIES+'/package.json');
const btc=require('@scure/btc-signer'),{pubECDSA}=require('@scure/btc-signer/utils');
const bitcoinjs=require('bitcoinjs-lib'),{secp256k1}=require('@noble/curves/secp256k1');
const key=new Uint8Array(32).fill(1),publicKey=pubECDSA(key,true),payment=btc.p2wpkh(publicKey);
const prev=new bitcoinjs.Transaction();prev.addInput(new Uint8Array(32),0xffffffff,0xffffffff,Uint8Array.of(3,1,2,3));prev.addOutput(payment.script,100000n);
const txid=prev.getId(),blockhash='b'.repeat(64),uuid='ac153211-4c87-47b7-8516-3256d6b70101';
let wallet=null,job=null,broadcasts=0,keyReads=0,balance=true,disagreement=false,failBroadcast=false,rawSigned=null,confirmed=false;
const rpc=async(n,p)=>{
 if(n==='ora_btc_key_v1'){keyReads++;return toHex(key);}
 if(n==='ora_btc_wallet_v1'){if(p.p_address)wallet={address:p.p_address,public_key:p.p_public_key};return wallet;}
 if(n==='ora_btc_job_v1')return job;
 if(n==='ora_btc_claim_v1'){if(job)return {claimed:false};job={id:p.p_id,amount_sats:p.p_amount,fee_sats:p.p_fee,status:'reserved'};return {claimed:true};}
 if(n==='ora_btc_signed_v1'){job={...job,status:'signed',txid:p.p_txid};rawSigned=p.p_rawtx;return job;}
 if(n==='ora_btc_result_v1'){job={...job,status:p.p_status};return job;}
 throw Error('unexpected_rpc');
};
const net={get:async(i,path)=>{
 if(path==='/block-height/0')return '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
 if(path==='/blocks/tip/height')return '110';
 if(path.includes('/address/'))return balance?[{txid,vout:0,value:disagreement&&i?100001:100000,status:{confirmed:true,block_height:100,block_hash:blockhash}}]:[];
 if(path==='/fee-estimates')return {'6':2};
 if(path.endsWith('/outspend/0'))return {spent:false};
 if(path==='/block-height/100')return blockhash;
 if(path==='/tx/'+txid+'/hex')return prev.toHex();
 if(path==='/tx/'+job?.txid+'/hex')return rawSigned;
 if(path.endsWith('/status'))return {confirmed,block_height:100,block_hash:blockhash};
 throw Error('unexpected_network_path');
},broadcast:async raw=>{broadcasts++;assert.equal(job.status,'signed');assert.equal(raw,rawSigned);if(failBroadcast)throw Error('timeout');return bitcoinjs.Transaction.fromHex(raw).getId();}};
const action=bitcoinHandler({btc,pubECDSA});
const run=(a,amount='10000')=>action({action:a,request_id:uuid,amount_sats:amount},{rpc,net});
assert.equal((await run('btc_observe')).status,404);assert.equal(keyReads,0);
assert.equal((await run('btc_create')).wallet.address,payment.address);assert.equal((await run('btc_create')).wallet.address,payment.address);
assert.equal(wallet.address,bitcoinjs.payments.p2wpkh({pubkey:publicKey}).address);
const reads=keyReads;
const preview=await run('btc_preview');assert.equal(preview.status,200);assert.equal(preview.signed,false);assert.equal(keyReads,reads);assert.equal(job,null);assert.equal(broadcasts,0);
disagreement=true;assert.equal((await run('btc_preview')).error,'bitcoin_observer_disagreement');disagreement=false;
balance=false;assert.equal((await run('btc_send')).error,'bitcoin_insufficient_confirmed_funds');assert.equal(keyReads,reads);balance=true;
assert.equal((await run('btc_send','10001')).error,'bitcoin_amount_cap');
const sent=await run('btc_send');assert.equal(sent.status,202);assert.equal(broadcasts,1);
const decoded=bitcoinjs.Transaction.fromHex(rawSigned);assert.equal(decoded.getId(),sent.txid);assert.equal(decoded.outs[0].value,10000n);assert.equal(bitcoinjs.address.fromOutputScript(decoded.outs[0].script),BTC_DESTINATION);assert.equal(bitcoinjs.address.fromOutputScript(decoded.outs[1].script),wallet.address);
assert.equal(100000n-decoded.outs.reduce((n,o)=>n+o.value,0n),BigInt(preview.fee_sats));
const witness=decoded.ins[0].witness,{signature,hashType}=bitcoinjs.script.signature.decode(witness[0]);assert.equal(hashType,1);
const scriptCode=bitcoinjs.payments.p2pkh({pubkey:publicKey}).output,digest=decoded.hashForWitnessV0(0,scriptCode,100000n,hashType);
assert.equal(secp256k1.verify(signature,digest,publicKey),true);
assert.equal((await run('btc_send')).replayed,true);assert.equal(broadcasts,1);
assert.equal((await run('btc_send','9999')).error,'bitcoin_idempotency_conflict');
confirmed=true;assert.equal((await run('btc_status')).job.status,'confirmed');
job=null;failBroadcast=true;assert.equal((await run('btc_send')).error,'bitcoin_outcome_unknown');assert.equal(job.status,'unknown');
const before=broadcasts;assert.equal((await run('btc_send')).replayed,true);assert.equal(broadcasts,before);
assert.throws(()=>selectBitcoin([{txid,value:600}],546n,2),/insufficient/);
let called=0;const route=handler({rpc:async()=>true,bitcoinAction:async()=>{called++;return {status:200};}});
const req=(body,auth=true)=>new Request('https://invalid',{method:'POST',headers:auth?{authorization:'Bearer '+'a'.repeat(64)}:{},body:JSON.stringify(body)});
assert.equal((await route(req({action:'btc_send'},false))).status,401);assert.equal(called,0);
assert.equal((await route(req({action:'btc_send',destination:payment.address}))).status,400);assert.equal(called,0);
console.log('PASS: BTC wallet identity independently derived, real synthetic Bitcoin signature verified using bitcoinjs BIP143 digest, fixed outputs/change/fees, preview without signing, observer disagreement, insufficient funds, replay/conflict, uncertain-broadcast freeze, confirmed receipt, anonymous rejection. No real UTXO used or transaction broadcast.');
