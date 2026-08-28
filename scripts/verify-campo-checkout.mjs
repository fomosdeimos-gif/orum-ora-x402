import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../pagar-teste.html', import.meta.url), 'utf8');
const home = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.match(home, /href="\/pagar-teste\.html"/);
assert.match(html, /const ENDPOINT='\/campo'/);
assert.match(html, /x402Version:2,scheme:'exact'/);
assert.match(html, /requirement\.amount/);
assert.match(html, /link\.metamask\.io\/dapp/);
assert.match(html, /Nada será assinado antes/);
assert.doesNotMatch(html, /pagina de teste|página de teste/i);

console.log(JSON.stringify({ verified: true, route: '/pagar-teste.html', endpoint: '/campo', mobile_handoff: true }));
