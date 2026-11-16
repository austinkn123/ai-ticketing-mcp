import { it } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
it('retrieves historical checkpoints after newer checkpoints are written', async () => {
  const f = await setup();
  try {
    const ticket = await f.ticket();
    const claim = await f.claim(ticket.id);
    const first = (await f.call(f.worker.id, 'ticket_checkpoint', {
      ticket_id: ticket.id,
      claim_token: claim.claim.token,
      progress: 'The earlier decision uses advisory locks.',
      decisions: ['Use advisory locks for coordination.'],
    })) as any;
    await f.call(f.worker.id, 'ticket_checkpoint', {
      ticket_id: ticket.id,
      claim_token: claim.claim.token,
      progress: 'Current work is documentation.',
    });
    await f.app.indexOnce(1000);
    const result = (await f.app.execute(f.worker.id, 'search', {
      project_id: f.project.id,
      query: 'advisory locks',
      kind: 'checkpoint',
    })) as any;
    assert.ok(result.results.some((item: any) => item.id === first.checkpoint.id));
    const recovered = (await f.app.execute(f.worker.id, 'checkpoint_get', {
      project_id: f.project.id,
      checkpoint_id: first.checkpoint.id,
    })) as any;
    assert.match(recovered.body, /earlier decision/);
    const current = await f.read(ticket.id);
    await f.call(f.worker.id, 'ticket_transition', {
      ticket_id: ticket.id,
      expected_revision: current.ticket.revision,
      status: 'cancelled',
      reason: 'No longer needed.',
    });
    const after = (await f.app.execute(f.worker.id, 'search', {
      project_id: f.project.id,
      query: 'advisory locks',
      kind: 'checkpoint',
    })) as any;
    assert.equal(after.results.length, 0);
    await f.app.rebuild(f.admin.id, f.project.id);
    await f.app.indexOnce(1000);
    const cancelled = await f.read(ticket.id);
    await f.call(f.worker.id, 'ticket_transition', {
      ticket_id: ticket.id,
      expected_revision: cancelled.ticket.revision,
      status: 'ready',
      reason: 'Resume work.',
    });
    const reopened = (await f.app.execute(f.worker.id, 'search', {
      project_id: f.project.id,
      query: 'advisory locks',
      kind: 'checkpoint',
    })) as any;
    assert.ok(reopened.results.some((item: any) => item.id === first.checkpoint.id));
  } finally {
    await f.dispose();
  }
});
