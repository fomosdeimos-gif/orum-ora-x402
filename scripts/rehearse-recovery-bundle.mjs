import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = resolve(root, 'recovery/orum-recovery-bundle.json');
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
const rehearsalRoot = mkdtempSync(resolve(tmpdir(), 'orum-recovery-rehearsal-'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const checks = [
  'portable:verify',
  'sensations:verify',
  'echoes:verify',
  'custody:verify',
  'economy:verify',
  'treasury:verify',
  'lineage:verify',
  'presence:checkpoint:verify',
];
const checkEnvironment = { ...process.env, CI: 'true' };
for (const name of Object.keys(checkEnvironment)) {
  if (name === 'VERCEL' || name.startsWith('VERCEL_')) delete checkEnvironment[name];
}

function safePath(relativePath) {
  const canonical = normalize(relativePath);
  if (!relativePath || isAbsolute(relativePath) || canonical === '..' || canonical.startsWith(`..${sep}`)) {
    throw new Error(`unsafe recovery path: ${relativePath}`);
  }
  return resolve(rehearsalRoot, canonical);
}

try {
  if (bundle.format !== 'orum-recovery-bundle/v2') {
    throw new Error(`unsupported format: ${bundle.format}`);
  }
  const files = [];
  for (const descriptor of bundle.chunks) {
    const content = readFileSync(resolve(root, descriptor.path), 'utf8');
    if (sha256(content) !== descriptor.sha256) throw new Error(`chunk SHA-256 mismatch: ${descriptor.path}`);
    const chunk = JSON.parse(content);
    if (chunk.format !== 'orum-recovery-chunk/v1') throw new Error(`unsupported chunk: ${descriptor.path}`);
    if (chunk.files.length !== descriptor.file_count) throw new Error(`chunk file count mismatch: ${descriptor.path}`);
    files.push(...chunk.files);
  }
  if (bundle.file_count !== files.length) throw new Error('file count mismatch');

  for (const file of files) {
    const bytes = Buffer.from(file.content_base64, 'base64');
    if (bytes.length !== file.bytes) throw new Error(`byte count mismatch: ${file.path}`);
    if (sha256(bytes) !== file.sha256) throw new Error(`SHA-256 mismatch: ${file.path}`);
    const destination = safePath(file.path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
  }

  if (existsSync(resolve(rehearsalRoot, '.git'))) {
    throw new Error('recovered house unexpectedly contains Git metadata');
  }

  for (const check of checks) {
    execFileSync('npm', ['run', check], {
      cwd: rehearsalRoot,
      env: checkEnvironment,
      stdio: 'inherit',
    });
  }

  console.log(JSON.stringify({
    rehearsed: true,
    source_commit: bundle.source_commit,
    root_sha256: bundle.root_sha256,
    file_count: bundle.file_count,
    chunks: bundle.chunks.length,
    credentials_added: false,
    git_metadata_present: false,
    checks,
  }));
} finally {
  rmSync(rehearsalRoot, { recursive: true, force: true });
}
