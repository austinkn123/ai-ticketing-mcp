import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { HttpEmbeddings } from '../src/adapters/embeddings.js';
import { schemas, readOperations } from '../src/schemas.js';
// @ts-ignore The validator is also directly executable by GitHub Actions.
import { validateCommit } from '../scripts/check-commits.mjs';
// @ts-ignore Shared executable JavaScript validator.
import { containsCredential } from '../scripts/check-secrets.mjs';

it('detects accidentally committed credentials without reporting their values', () => {
  assert.equal(containsCredential('gho_' + 'a'.repeat(40)), true);
  assert.equal(containsCredential('example password placeholder'), false);
});

it('validates semantic commits and breaking-change migration notices', () => {
  for (const message of [
    'feat(storage): add claims',
    'fix: handle retry',
    'docs(adapters): describe contracts',
    'feat(mcp)!: change output\n\nBREAKING CHANGE: Update clients to read data.',
  ])
    assert.equal(validateCommit(message), null);
  for (const message of ['changes', 'Feature: new tool', 'fix:', 'feat!: break clients'])
    assert.ok(validateCommit(message));
});
it('classifies reads and validates mutation boundaries', () => {
  assert.ok(readOperations.has('ticket_get'));
  assert.ok(!readOperations.has('work_claim'));
  assert.equal(
    schemas.tickets_create.safeParse({ project_id: 'bad', idempotency_key: 'x', tickets: [] }).success,
    false,
  );
  assert.equal(
    schemas.work_claim.safeParse({
      project_id: 'c9b676b8-26ab-4af6-aa35-de77b969ce0a',
      idempotency_key: 'abcdefgh',
      actor_id: 'injected',
    }).success,
    false,
  );
});
it('keeps domain and port modules free of concrete adapters and protocol imports', async () => {
  for (const path of ['src/application.ts', 'src/contracts.ts', 'src/schemas.ts']) {
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(source, /from\s+['"](?:pg|jose|@modelcontextprotocol|.*adapters\/)/);
  }
});
it('supports both embedding protocols and includes all document chunks', async () => {
  const requests: { url: string; body: any; authorization?: string }[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ url: req.url!, body, authorization: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    const vectors = body.input.map((_: unknown, i: number) => [1, i + 1, 1]);
    res.end(
      JSON.stringify(
        req.url === '/api/embed'
          ? { embeddings: vectors }
          : { data: vectors.map((embedding: number[], index: number) => ({ embedding, index })) },
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const local = new HttpEmbeddings({
      provider: 'ollama',
      url: base,
      model: 'nomic-embed-text',
      dimensions: 3,
    });
    const vector = await local.embed('x'.repeat(13000), 'document');
    assert.equal(vector.length, 3);
    assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-10);
    assert.equal(requests[0]!.body.input.length, 3);
    assert.ok(requests[0]!.body.input.every((s: string) => s.startsWith('search_document:')));
    assert.equal(requests[0]!.body.truncate, false);
    const hosted = new HttpEmbeddings({
      provider: 'openai',
      url: `${base}/v1`,
      model: 'configured-model',
      dimensions: 3,
      apiKey: 'unit-test-only',
    });
    await hosted.embed('query', 'query');
    assert.equal(requests[1]!.url, '/v1/embeddings');
    assert.equal(requests[1]!.authorization, 'Bearer unit-test-only');
    assert.notEqual(local.profile.id, hosted.profile.id);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
it('rejects malformed vectors and provider errors', async () => {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ embeddings: [[0, 0, 0]] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const provider = new HttpEmbeddings({
      provider: 'ollama',
      url: `http://127.0.0.1:${(server.address() as any).port}`,
      model: 'test',
      dimensions: 3,
    });
    await assert.rejects(provider.embed('query', 'query'), { code: 'INVALID_EMBEDDING' });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
