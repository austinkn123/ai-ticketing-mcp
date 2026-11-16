import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
let template = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
template = template.replaceAll('replace-with-generated-hex', () => randomBytes(32).toString('hex'));
try {
  await writeFile(new URL('../.env', import.meta.url), template, { flag: 'wx', mode: 0o600 });
  process.stdout.write(
    'Created private .env. Start with docker compose --profile auth --profile local-ai up -d --build\n',
  );
} catch (error) {
  if (error.code === 'EEXIST') process.stdout.write('.env already exists; preserved existing settings.\n');
  else throw error;
}
