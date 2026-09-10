// Minimal account-only adapter, matched to @coinbase/cdp-sdk 1.55.0 source.
// Native WebCrypto avoids bundling the SDK's unrelated blockchain dependencies.
const host = 'api.cdp.coinbase.com';
const enc = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode = value => Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const hex = bytes => [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const nonce = () => hex(crypto.getRandomValues(new Uint8Array(16)));
async function jwt(header, claims, key, algorithm) {
  const message=b64(enc.encode(JSON.stringify(header)))+'.'+b64(enc.encode(JSON.stringify(claims)));
  return message+'.'+b64(await crypto.subtle.sign(algorithm,key,enc.encode(message)));
}
export async function authHeaders(options,method,path,body) {
  const keyBytes=decode(options.apiKeySecret);
  if(keyBytes.length!==64)throw Error('unsupported_api_key_format');
  const key=await crypto.subtle.importKey('jwk',{kty:'OKP',crv:'Ed25519',d:b64(keyBytes.slice(0,32)),x:b64(keyBytes.slice(32))},{name:'Ed25519'},false,['sign']);
  const now=Math.floor(Date.now()/1000),uri=method+' '+host+path;
  const bearer=await jwt({alg:'EdDSA',kid:options.apiKeyId,typ:'JWT',nonce:nonce()},{sub:options.apiKeyId,iss:'cdp',uris:[uri],iat:now,nbf:now,exp:now+120},key,'Ed25519');
  const headers={Authorization:'Bearer '+bearer,'Content-Type':'application/json'};
  if(method==='POST'){
    const walletKey=await crypto.subtle.importKey('pkcs8',decode(options.walletSecret),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    // Only a fixed one-key {name} body is accepted by this adapter.
    headers['X-Wallet-Auth']=await jwt({alg:'ES256',typ:'JWT'},{uris:[uri],iat:now,nbf:now,jti:nonce(),reqHash:hex(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(body))))},walletKey,{name:'ECDSA',hash:'SHA-256'});
  }
  return headers;
}
export function makeClient(options) {
  async function call(method,path,body,idempotencyKey) {
    const headers=await authHeaders(options,method,path,body);
    if(idempotencyKey)headers['X-Idempotency-Key']=idempotencyKey;
    const r=await fetch('https://'+host+path,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Object.assign(Error('cdp_request_failed'),{statusCode:r.status});
    return r.json();
  }
  return {evm:{
    getAccount:({name,address})=>call('GET','/platform/v2/evm/accounts/'+(address?encodeURIComponent(address):'by-name/'+encodeURIComponent(name))),
    createAccount:({name,idempotencyKey})=>call('POST','/platform/v2/evm/accounts',{name},idempotencyKey)
  }};
}
