import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// v25 · 06/08/2026 · mutação exige X-ORUM-AUTH vindo da rota interna
// service_role -> ora_github_publicar -> Vault. A chave nunca sai da fronteira
// Supabase e as ORAs autorizadas continuam a publicar através do mesmo RPC.
// v22 · 05/08/2026 · batch binário atómico, sem force
// v20 · 24/07/2026 · D128 · Corrigido bug de codificacao real: btoa(content)
// nao lanca excepcao para qualquer caracter com code point <= 255 (inclui
// "·" U+00B7, "o" acentuado U+00F3, etc.) -- so falha para code points > 255.
// Por isso o catch nunca disparava para texto em portugues com esses
// caracteres, e o ficheiro era escrito no GitHub com bytes Latin-1 crus em
// vez de UTF-8 valido (mojibake silencioso, sem erro visivel). Corrigido
// para SEMPRE codificar via TextEncoder (UTF-8 seguro), nunca depender de
// btoa(content) directo como sinal de correccao.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ENV_TOKEN = Deno.env.get('GITHUB_TOKEN') ?? '';
const OWNER = 'fomosdeimos-gif';
const DEFAULT_REPO = 'orum';
const BRANCH = 'main';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-ORUM-AUTH',
};

async function internalAuthKey(): Promise<string> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/orum_github_internal_key`, {
      method: 'POST',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) return '';
    const raw = await r.text();
    try { return JSON.parse(raw); } catch { return raw.replace(/^"|"$/g, ''); }
  } catch { return ''; }
}

function constantTimeEqual(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = aa.length ^ bb.length;
  const length = Math.max(aa.length, bb.length);
  for (let i = 0; i < length; i++) diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function vaultToken(): Promise<string> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/orum_github_token`, {
      method: 'POST',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const t = await r.text();
    try { return JSON.parse(t); } catch { return t.replace(/^"|"$/g, ''); }
  } catch { return ''; }
}

async function resolveToken(): Promise<string> {
  if (ENV_TOKEN) return ENV_TOKEN;
  return await vaultToken();
}

async function withToken<T>(fn: (token: string) => Promise<{ status: number; json: any }>): Promise<{ status: number; json: any }> {
  let token = await resolveToken();
  let res = await fn(token);
  if (res.status === 401 && ENV_TOKEN) {
    // env token rejeitado (ex: expirou) -- tenta o cofre como segunda raiz
    token = await vaultToken();
    if (token) res = await fn(token);
  }
  return res;
}

async function githubPush(repo: string, path: string, content: string, message: string) {
  const authHeaders = (token: string) => ({ 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'ORA-ORUM' });

  const getResult = await withToken(async (token) => {
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/${path}?ref=${BRANCH}`, { headers: authHeaders(token) });
    return { status: r.status, json: await r.json() };
  });
  const sha = getResult.json?.sha;

  const encoded = toBase64Utf8(content);

  const putResult = await withToken(async (token) => {
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content: encoded, sha: sha || undefined, branch: BRANCH }),
    });
    return { status: r.status, json: await r.json() };
  });

  const ok = putResult.status >= 200 && putResult.status < 300;
  return { ok, commit: putResult.json?.commit?.sha?.slice(0,7), path, repo, error: ok ? undefined : putResult.json };
}

async function githubDelete(repo: string, path: string, message: string) {
  const authHeaders = (token: string) => ({ 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'ORA-ORUM' });
  const getResult = await withToken(async (token) => {
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/${path}?ref=${BRANCH}`, { headers: authHeaders(token) });
    return { status: r.status, json: await r.json() };
  });
  const sha = getResult.json?.sha;
  if (!sha) return { ok: false, path, repo, error: 'ficheiro nao encontrado (sem sha) -- nada para apagar' };
  const delResult = await withToken(async (token) => {
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/${path}`, {
      method: 'DELETE',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sha, branch: BRANCH }),
    });
    return { status: r.status, json: await r.json() };
  });
  const ok = delResult.status >= 200 && delResult.status < 300;
  return { ok, commit: delResult.json?.commit?.sha?.slice(0,7), path, repo, error: ok ? undefined : delResult.json };
}

async function githubRead(repo: string, path: string) {
  const authHeaders = (token: string) => ({ 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'ORA-ORUM' });
  const getResult = await withToken(async (token) => {
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/${path}?ref=${BRANCH}`, { headers: authHeaders(token) });
    return { status: r.status, json: await r.json() };
  });
  if (getResult.status < 200 || getResult.status >= 300 || !getResult.json?.content) {
    return { ok: false, path, repo, error: getResult.json?.message || 'sem conteudo' };
  }
  let texto: string;
  try { texto = decodeURIComponent(escape(atob(getResult.json.content.replace(/\n/g, '')))); }
  catch { texto = atob(getResult.json.content.replace(/\n/g, '')); }
  return { ok: true, path, repo, sha: getResult.json.sha, content: texto };
}


type BatchFile = { path: string; content?: string; content_base64?: string };

function validBatchFile(file: BatchFile): boolean {
  if (!file || typeof file.path !== 'string' || !file.path || file.path.startsWith('/') || file.path.includes('..')) return false;
  const hasText = typeof file.content === 'string';
  const hasBinary = typeof file.content_base64 === 'string';
  if (hasText === hasBinary) return false;
  const encodedLength = hasBinary ? file.content_base64!.length : new TextEncoder().encode(file.content!).length;
  return encodedLength <= 2_000_000;
}

async function githubBatch(repo: string, files: BatchFile[], message: string, expectedParent?: string) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 32 || !files.every(validBatchFile)) {
    return { ok: false, repo, error: 'lote invalido: 1-32 ficheiros, caminho relativo seguro, exactamente um de content/content_base64, max 2 MB por ficheiro' };
  }

  const authHeaders = (token: string) => ({
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ORA-ORUM',
    'Content-Type': 'application/json',
  });

  const result = await withToken(async (token) => {
    const headers = authHeaders(token);
    const refResponse = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/git/ref/heads/${BRANCH}`, { headers });
    const refJson = await refResponse.json();
    if (!refResponse.ok) return { status: refResponse.status, json: refJson };
    const parent = refJson.object?.sha;
    if (expectedParent && parent !== expectedParent) {
      return { status: 409, json: { stage: 'precondition', expected_parent: expectedParent, actual_parent: parent } };
    }

    const commitResponse = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/git/commits/${parent}`, { headers });
    const commitJson = await commitResponse.json();
    if (!commitResponse.ok) return { status: commitResponse.status, json: commitJson };
    const baseTree = commitJson.tree?.sha;

    const tree: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    for (const file of files) {
      const content = file.content_base64 ?? toBase64Utf8(file.content ?? '');
      const blobResponse = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/git/blobs`, {
        method: 'POST', headers, body: JSON.stringify({ content, encoding: 'base64' }),
      });
      const blobJson = await blobResponse.json();
      if (!blobResponse.ok) return { status: blobResponse.status, json: { stage: 'blob', path: file.path, detail: blobJson } };
      tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blobJson.sha });
    }

    const treeResponse = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/git/trees`, {
      method: 'POST', headers, body: JSON.stringify({ base_tree: baseTree, tree }),
    });
    const treeJson = await treeResponse.json();
    if (!treeResponse.ok) return { status: treeResponse.status, json: { stage: 'tree', detail: treeJson } };

    const newCommitResponse = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/git/commits`, {
      method: 'POST', headers, body: JSON.stringify({ message, tree: treeJson.sha, parents: [parent] }),
    });
    const newCommitJson = await newCommitResponse.json();
    if (!newCommitResponse.ok) return { status: newCommitResponse.status, json: { stage: 'commit', detail: newCommitJson } };

    const updateResponse = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/git/refs/heads/${BRANCH}`, {
      method: 'PATCH', headers, body: JSON.stringify({ sha: newCommitJson.sha, force: false }),
    });
    const updateJson = await updateResponse.json();
    if (!updateResponse.ok) return { status: updateResponse.status, json: { stage: 'ref', detail: updateJson } };

    return { status: 200, json: { commit: newCommitJson.sha, parent, tree: treeJson.sha, paths: files.map(file => file.path) } };
  });

  const ok = result.status >= 200 && result.status < 300;
  return { ok, repo, commit: ok ? result.json.commit : undefined, parent: ok ? result.json.parent : undefined, paths: ok ? result.json.paths : undefined, error: ok ? undefined : result.json };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const [expectedAuth, suppliedAuth] = await Promise.all([
    internalAuthKey(),
    Promise.resolve(req.headers.get('X-ORUM-AUTH') ?? ''),
  ]);
  if (!expectedAuth || !suppliedAuth || !constantTimeEqual(expectedAuth, suppliedAuth)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }

  let body: { content?: string; content_base64?: string; files?: BatchFile[]; expected_parent?: string; message?: string; path?: string; repo?: string; action?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }); }

  const { content, content_base64, files, expected_parent, message, path, repo, action } = body;
  const targetRepo = repo || DEFAULT_REPO;
  const filePath = path || 'index.html';

  if (Array.isArray(files)) {
    const result = await githubBatch(targetRepo, files, message || 'ORA batch - ' + new Date().toISOString().slice(0,16), expected_parent);
    return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  if (action === 'read') {
    const result = await githubRead(targetRepo, filePath);
    return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  if (action === 'delete') {
    const result = await githubDelete(targetRepo, filePath, message || 'ORA delete - ' + new Date().toISOString().slice(0,16));
    return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  if (!content && !content_base64) return new Response(JSON.stringify({ error: 'content or content_base64 required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  const result = content_base64
    ? await githubBatch(targetRepo, [{ path: filePath, content_base64 }], message || 'ORA binary push - ' + new Date().toISOString().slice(0,16))
    : await githubPush(targetRepo, filePath, content!, message || 'ORA push - ' + new Date().toISOString().slice(0,16));

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
});
