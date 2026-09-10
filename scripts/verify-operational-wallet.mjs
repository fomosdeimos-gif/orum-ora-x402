import assert from 'node:assert/strict';
import { handler, ACCOUNT_NAME, CREATE_ID } from '../supabase/functions/ora-operational-wallet/core.mjs';
const address='0x1111111111111111111111111111111111111111', token='a'.repeat(64);
let created=0, secretReads=0, exists=false, authenticated=true, failure=false;
const rpc=async (name)=>{
  if(name==='ora_operational_wallet_auth_v1')return authenticated;
  secretReads++;
  return name==='orum_cdp_keys'?[{key_id:'test',key_secret:'test'}]:[{wallet_secret:'test'}];
};
const makeClient=()=>({evm:{
  getAccount:async()=>{if(failure)throw Object.assign(Error('DO_NOT_LEAK'),{statusCode:401});if(!exists)throw Object.assign(Error('not found'),{statusCode:404});return {address,name:ACCOUNT_NAME};},
  createAccount:async options=>{assert.equal(options.name,ACCOUNT_NAME);assert.equal(options.idempotencyKey,CREATE_ID);created++;exists=true;return {address,name:ACCOUNT_NAME};}
}});
const chainRpc=async method=>method==='eth_chainId'?'0x2105':method==='eth_blockNumber'?'0x10':method==='eth_getBalance'?'0x0':'0x'+'0'.repeat(64);
const run=handler({rpc,makeClient,chainRpc});
const req=(action,auth=true)=>new Request('https://local.invalid',{method:'POST',headers:auth?{authorization:'Bearer '+token}:{},body:JSON.stringify({action})});
assert.equal((await run(req('create',false))).status,401);assert.equal(secretReads,0);
authenticated=false;assert.equal((await run(req('create'))).status,401);assert.equal(secretReads,0);authenticated=true;
assert.equal((await run(req('transfer'))).status,400);assert.equal(secretReads,0);
assert.equal((await run(req('observe'))).status,404);assert.equal(created,0);
const first=await (await run(req('create'))).json();assert.equal(first.created,true);assert.equal(first.balances.usdc_atomic,'0');
assert.equal(first.financial_transaction_signed,false);assert.equal(first.transfers_enabled,true);
const second=await (await run(req('create'))).json();assert.equal(second.created,false);assert.equal(created,1);
failure=true;const error=await run(req('create'));assert.equal(error.status,502);assert.equal((await error.text()).includes('DO_NOT_LEAK'),false);assert.equal(created,1);
console.log('PASS: authentication, action bounds, no implicit creation, idempotent named account, readback, balances, sanitized failures; mocked provider only.');
const {authHeaders}=await import('../supabase/functions/ora-operational-wallet/cdp.mjs');
const ed=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',ed.privateKey);
const ec=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const walletSecret=Buffer.from(await crypto.subtle.exportKey('pkcs8',ec.privateKey)).toString('base64');
const apiKeySecret=Buffer.concat([Buffer.from(jwk.d,'base64url'),Buffer.from(jwk.x,'base64url')]).toString('base64');
const headers=await authHeaders({apiKeyId:'synthetic-key',apiKeySecret,walletSecret},'POST','/platform/v2/evm/accounts',{name:ACCOUNT_NAME});
for(const [value,key,algorithm] of [[headers.Authorization.slice(7),ed.publicKey,'Ed25519'],[headers['X-Wallet-Auth'],ec.publicKey,{name:'ECDSA',hash:'SHA-256'}]]){
 const parts=value.split('.');assert.equal(await crypto.subtle.verify(algorithm,key,Buffer.from(parts[2],'base64url'),new TextEncoder().encode(parts[0]+'.'+parts[1])),true);
 const payload=JSON.parse(Buffer.from(parts[1],'base64url'));assert.deepEqual(payload.uris,['POST api.cdp.coinbase.com/platform/v2/evm/accounts']);
}
console.log('PASS: Ed25519 and P-256 API-auth signatures verified with ephemeral synthetic keys; no wallet transaction signed.');
