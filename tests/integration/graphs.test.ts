import { it } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { hasCode } from '../../src/testing/contracts.js';
it('rejects cycles combining parent completion and explicit dependencies', async () => {
  const f = await setup();
  try {
    const parent = await f.ticket();
    const child = await f.ticket({ parent_id: parent.id });
    await assert.rejects(
      f.call(f.worker.id, 'ticket_link', {
        source_id: parent.id,
        target_id: child.id,
        kind: 'blocks',
        action: 'add',
      }),
      hasCode('DEPENDENCY_CYCLE'),
    );
    const a = await f.ticket();
    const b = await f.ticket();
    await f.call(f.worker.id, 'ticket_link', {
      source_id: a.id,
      target_id: b.id,
      kind: 'blocks',
      action: 'add',
    });
    const current = await f.read(b.id);
    await assert.rejects(
      f.call(f.worker.id, 'ticket_update', {
        ticket_id: b.id,
        parent_id: a.id,
        expected_revision: current.ticket.revision,
      }),
      hasCode('DEPENDENCY_CYCLE'),
    );
  } finally {
    await f.dispose();
  }
});
