import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export function containsCredential(text) {
  return /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(
    text,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  let privateValues = [];
  try {
    const env = await readFile('.env', 'utf8');
    privateValues = env
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]*(PASSWORD|SECRET|API_KEY)=/.test(line))
      .map((line) => line.slice(line.indexOf('=') + 1))
      .filter((value) => value.length >= 20 && !value.includes('replace-with'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const found = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    if (containsCredential(text) || privateValues.some((value) => text.includes(value))) found.push(file);
  }
  if (found.length) {
    process.stderr.write(`Potential credentials in: ${found.join(', ')}\n`);
    process.exitCode = 1;
  } else
    process.stdout.write(
      `Checked ${files.length} publishable files for credential patterns and local secret values.\n`,
    );
}
