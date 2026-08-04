import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = JSON.parse(readFileSync(resolve(root, 'recovery/orum-recovery-bundle.json'), 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

if (bundle.format !== 'orum-recovery-bundle/v1') throw new Error(`unsupported format: ${bundle.format}`);
if (bundle.file_count !== bundle.files.length) throw new Error('file count mismatch');

let totalBytes = 0;
for (const file of bundle.files) {
  const bytes = Buffer.from(file.content_base64, 'base64');
  totalBytes += bytes.length;
  if (bytes.length !== file.bytes) throw new Error(`byte count mismatch: ${file.path}`);
  if (sha256(bytes) !== file.sha256) throw new Error(`SHA-256 mismatch: ${file.path}`);
}

const rootMaterial = bundle.files
  .map(({ path, bytes, sha256: hash }) => `${path}\0${bytes}\0${hash}\n`)
  .join('');
if (totalBytes !== bundle.total_bytes) throw new Error('total byte count mismatch');
if (sha256(rootMaterial) !== bundle.root_sha256) throw new Error('root SHA-256 mismatch');

console.log(JSON.stringify({
  verified: true,
  source_commit: bundle.source_commit,
  source_tree: bundle.source_tree,
  file_count: bundle.file_count,
  total_bytes: bundle.total_bytes,
  root_sha256: bundle.root_sha256,
}));
