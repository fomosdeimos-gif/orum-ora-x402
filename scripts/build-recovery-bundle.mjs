import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(root, 'recovery/orum-recovery-bundle.json');
const recoveryDirectory = resolve(root, 'recovery');
const excluded = (path) => path === 'recovery/orum-recovery-bundle.json' || /^recovery\/orum-recovery-bundle-\d+\.json$/.test(path);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root })
  .toString('utf8')
  .split('\0')
  .filter(Boolean)
  .filter((path) => !excluded(path))
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
for (const name of readdirSync(recoveryDirectory)) {
  if (/^orum-recovery-bundle-\d+\.json$/.test(name)) unlinkSync(resolve(recoveryDirectory, name));
}

const chunkGroups = [];
let current = [];
let encodedBytes = 0;
for (const file of files) {
  if (current.length && encodedBytes + file.content_base64.length > 300_000) {
    chunkGroups.push(current);
    current = [];
    encodedBytes = 0;
  }
  current.push(file);
  encodedBytes += file.content_base64.length;
}
if (current.length) chunkGroups.push(current);

const chunks = chunkGroups.map((chunkFiles, index) => {
  const path = `recovery/orum-recovery-bundle-${String(index + 1).padStart(2, '0')}.json`;
  const content = `${JSON.stringify({ format: 'orum-recovery-chunk/v1', index: index + 1, files: chunkFiles }, null, 2)}\n`;
  writeFileSync(resolve(root, path), content);
  return {
    path,
    file_count: chunkFiles.length,
    total_bytes: chunkFiles.reduce((sum, file) => sum + file.bytes, 0),
    sha256: sha256(content),
  };
});

const bundle = {
  format: 'orum-recovery-bundle/v2',
  repository: 'fomosdeimos-gif/orum-ora-x402',
  source_commit: sourceCommit,
  source_tree: sourceTree,
  file_count: files.length,
  total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
  root_sha256: sha256(rootMaterial),
  chunks,
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
  chunks: bundle.chunks.length,
}));
