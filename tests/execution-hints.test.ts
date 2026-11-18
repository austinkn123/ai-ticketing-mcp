import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../src/application.js';
import type { SearchAdapter } from '../src/contracts.js';
import { schemas } from '../src/schemas.js';
import { serializeSuccessEnvelope } from '../src/envelope.js';
import { contextFixture } from './context-fixture.js';

it('validates bounded provider-neutral execution hints and normalizes clear values', () => {
  const base = { key: 'HINT', name: 'Hints', idempotency_key: 'hints-key' };
  assert.equal(Object.hasOwn(schemas.project_create.parse(base), 'execution_hints'), false);
  assert.deepEqual(
    schemas.project_create.parse({
      ...base,
      execution_hints: { model: ' unknown/model ', effort: ' custom-effort ' },
    }).execution_hints,
    { model: 'unknown/model', effort: 'custom-effort' },
  );
  for (const execution_hints of [null, {}, { model: '', effort: '   ' }, { model: null, effort: null }])
    assert.equal(schemas.project_create.parse({ ...base, execution_hints }).execution_hints, null);
  for (const execution_hints of [
    { model: 'x'.repeat(129) },
    { effort: 'x'.repeat(33) },
    { model: 1 },
    { provider: 'vendor' },
  ])
    assert.equal(schemas.project_create.safeParse({ ...base, execution_hints }).success, false);
  const f = contextFixture();
  const mutation = {
    project_id: f.project.id,
    ticket_id: f.ticket.id,
    expected_revision: 1,
    idempotency_key: 'hints-key',
  };
  for (const parsed of [
    schemas.project_update.parse({
      project_id: f.project.id,
      expected_revision: 1,
      idempotency_key: 'hints-key',
    }),
    schemas.ticket_update.parse(mutation),
  ])
    assert.equal(Object.hasOwn(parsed, 'execution_hints'), false);
});

it('omits absent legacy hints and exposes merged hints in current details/context without inflating summaries', async () => {
  const f = contextFixture();
  f.tables.projects![0].execution_hints = null;
  f.tables.tickets![0].execution_hints = null;
  const app = createApplication({ storage: f.storage, search: {} as SearchAdapter, now: () => f.now });
  const input = { project_id: f.project.id, ticket_id: f.ticket.id };
  const initial = (await app.execute(f.actor.id, 'ticket_context', { ...input, detail: 'full' })) as any;
  assert.equal(Object.hasOwn(initial, 'effective_execution_hints'), false);
  assert.equal(Object.hasOwn(initial.ticket, 'execution_hints'), false);
  f.tables.projects![0].execution_hints = { model: 'custom/model', effort: 'xhigh' };
  f.tables.tickets![0].execution_hints = { effort: 'high' };
  const details = (await app.execute(f.actor.id, 'ticket_get', input)) as any;
  assert.deepEqual(details.effective_execution_hints, { model: 'custom/model', effort: 'high' });
  const context = (await app.execute(f.actor.id, 'ticket_context', {
    ...input,
    detail: 'full',
    if_none_match: initial.fingerprint,
  })) as any;
  assert.equal(context.not_modified, false);
  assert.deepEqual(context.effective_execution_hints, details.effective_execution_hints);
  const summaries = (await app.execute(f.actor.id, 'ticket_list', { project_id: f.project.id })) as any;
  assert.equal(Object.hasOwn(summaries.tickets[0], 'execution_hints'), false);
  delete f.tables.projects![0].execution_hints;
  delete f.tables.tickets![0].execution_hints;
  const cleared = await app.execute(f.actor.id, 'ticket_context', { ...input, detail: 'full' });
  assert.equal(serializeSuccessEnvelope(cleared), serializeSuccessEnvelope(initial));
});

it('does not grant project administration through execution hints', async () => {
  const f = contextFixture();
  const app = createApplication({ storage: f.storage, search: {} as SearchAdapter });
  await assert.rejects(
    app.execute(f.actor.id, 'project_update', {
      project_id: f.project.id,
      expected_revision: 1,
      idempotency_key: 'hints-key',
      execution_hints: { model: 'any/model', effort: 'admin' },
    }),
    { code: 'FORBIDDEN' },
  );
});
