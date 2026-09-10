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
assert.equal(first.financial_transaction_signed,false);assert.equal(first.transfers_enabled,false);
const second=await (await run(req('create'))).json();assert.equal(second.created,false);assert.equal(created,1);
failure=true;const error=await run(req('create'));assert.equal(error.status,502);assert.equal((await error.text()).includes('DO_NOT_LEAK'),false);assert.equal(created,1);
console.log('PASS: authentication, action bounds, no implicit creation, idempotent named account, readback, balances, sanitized failures; mocked provider only.');
