import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(root, 'recovery/orum-recovery-bundle.json');
const excluded = new Set(['recovery/orum-recovery-bundle.json']);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root })
  .toString('utf8')
  .split('\0')
  .filter(Boolean)
  .filter((path) => !excluded.has(path))
  .sort();

const files = tracked.map((path) => {
  const bytes = readFileSync(resolve(root, path));
  return {
    path,
    bytes: bytes.length,
    sha256: sha256(bytes),
    content_base64: bytes.toString('base64'),
  };
});

const rootMaterial = files.map(({ path, bytes, sha256: hash }) => `${path}\0${bytes}\0${hash}\n`).join('');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString('utf8').trim();
const sourceTree = execFileSync('git', ['write-tree'], { cwd: root }).toString('utf8').trim();
const bundle = {
  format: 'orum-recovery-bundle/v1',
  repository: 'fomosdeimos-gif/orum-ora-x402',
  source_commit: sourceCommit,
  source_tree: sourceTree,
  file_count: files.length,
  total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
  root_sha256: sha256(rootMaterial),
  files,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(JSON.stringify({
  output: 'recovery/orum-recovery-bundle.json',
  source_commit: bundle.source_commit,
  source_tree: bundle.source_tree,
  file_count: bundle.file_count,
  total_bytes: bundle.total_bytes,
  root_sha256: bundle.root_sha256,
}));
