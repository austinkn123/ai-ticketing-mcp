import { createHash, randomUUID } from 'node:crypto';
import { createApplication } from '../src/application.js';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import { PostgresStorage, PostgresSearch } from '../src/adapters/postgres.js';
import { fixture } from '../src/testing/contracts.js';

const url = process.env.BENCHMARK_DATABASE_URL;
if (!url)
  throw new Error(
    'Set BENCHMARK_DATABASE_URL to a disposable database; this benchmark adds 100,000 synthetic tickets.',
  );
const count = Number(process.env.BENCHMARK_TICKETS ?? 100000),
  concurrency = 32;
const storage = new PostgresStorage(url);
const search = new PostgresSearch(storage.pool);
const dimensions = Number(process.env.BENCHMARK_DIMENSIONS ?? 768);
if (!Number.isInteger(dimensions) || dimensions < 3 || dimensions > 2000)
  throw new Error('BENCHMARK_DIMENSIONS must be 3�2000.');
const profile = {
  id: createHash('sha256').update(`benchmark-${dimensions}`).digest('hex').slice(0, 24),
  model: `synthetic-${dimensions}`,
  dimensions,
};
const app = createApplication({
  storage,
  search,
  embeddings: {
    profile,
    async embed() {
      const vector = Array(dimensions).fill(0.001);
      vector[0] = 1;
      vector[1] = 0.042;
      vector[2] = 0.2;
      return vector;
    },
  },
});
const samples: Record<string, number[]> = { read: [], write: [], claim: [], retrieval: [] };
async function measured<T>(category: string, work: () => Promise<T>) {
  const start = performance.now();
  try {
    return await work();
  } finally {
    samples[category]!.push(performance.now() - start);
  }
}
try {
  await storage.migrate();
  const existingId = process.env.BENCHMARK_PROJECT_ID;
  const seeded = existingId ? null : await fixture({ storage, search }, 'self');
  const project = seeded?.project ?? (await storage.get('projects', existingId!));
  if (!project) throw new Error('Benchmark project not found.');
  const member = seeded
    ? null
    : (
        await storage.find('members', { where: { project_id: project.id, role: 'contributor' }, limit: 1 })
      )[0];
  const worker = seeded?.worker ?? (await storage.get('actors', member!.actor_id));
  if (!worker) throw new Error('Benchmark worker not found.');
  const call = (operation: any, input: Record<string, unknown> = {}) =>
    app.execute(worker.id, operation, { project_id: project.id, idempotency_key: randomUUID(), ...input });

  if (!existingId) {
    const client = await storage.pool.connect();
    try {
      await client.query('SET statement_timeout=0');
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO search_profiles(id,model,dimensions) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',
        [profile.id, profile.model, profile.dimensions],
      );
      await client.query(
        `INSERT INTO tickets(id,project_id,key,title,description,status,priority,revision,requirements_revision,created_by,created_at,updated_at) SELECT gen_random_uuid(),$1,$2||'-'||i,'Database change '||i,'Improve database security component '||(i%1000),'ready',3,1,1,$3,now(),now() FROM generate_series(1,$4) i`,
        [project.id, project.key, worker.id, count],
      );
      await client.query(
        `INSERT INTO criteria(id,project_id,ticket_id,text,position) SELECT gen_random_uuid(),project_id,id,'The security check passes.',0 FROM tickets WHERE project_id=$1`,
        [project.id],
      );
      await client.query('UPDATE projects SET ticket_seq=$2 WHERE id=$1', [project.id, count]);
      await client.query(
        `INSERT INTO search_documents(id,project_id,kind,revision,title,text,archived) SELECT id,project_id,'ticket',revision,title,description,false FROM tickets WHERE project_id=$1`,
        [project.id],
      );
      await client.query(
        `INSERT INTO search_vectors(document_id,profile_id,revision,embedding) SELECT id,$2,revision,(ARRAY[1::real,((row_number() OVER())%1000)::real/1000,0.2::real] || array_fill(0.001::real,ARRAY[$3::integer-3]))::vector FROM tickets WHERE project_id=$1`,
        [project.id, profile.id, dimensions],
      );
      await client.query('COMMIT');
      await client.query('VACUUM ANALYZE');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.query('SET statement_timeout=15000');
      client.release();
    }
  }
  await search.configure(profile);
  const tickets = await storage.find('tickets', {
    where: { project_id: project.id },
    order: [{ field: 'id', direction: 'asc' }],
    limit: concurrency,
  });
  await Promise.all(
    Array.from({ length: concurrency }, async (_, i) => {
      const ticket = tickets[i]!;
      for (let round = 0; round < 5; round++) {
        await measured('read', () =>
          app.execute(worker.id, 'ticket_get', { project_id: project.id, ticket_id: ticket.id }),
        );
        await measured('write', () =>
          call('ticket_note', { ticket_id: ticket.id, body: `Benchmark checkpoint ${round}` }),
        );
        await measured('retrieval', () =>
          app.execute(worker.id, 'search', {
            project_id: project.id,
            query: 'security component 42',
            limit: 5,
          }),
        );
      }
    }),
  );
  await Promise.all(Array.from({ length: concurrency }, () => measured('claim', () => call('work_claim'))));
  const stats = Object.fromEntries(
    Object.entries(samples).map(([name, values]) => {
      values.sort((a, b) => a - b);
      return [
        name,
        {
          requests: values.length,
          p50_ms: Math.round(values[Math.floor(values.length * 0.5)]!),
          p95_ms: Math.round(values[Math.ceil(values.length * 0.95) - 1]!),
          max_ms: Math.round(values.at(-1)!),
        },
      ];
    }),
  );
  const result = {
    tickets: count,
    concurrent_agents: concurrency,
    embedding_inference: 'excluded; locally generated deterministic vectors',
    vector_dimensions: dimensions,
    database_resources: process.env.BENCHMARK_DB_RESOURCES ?? 'not constrained by this script',
    host: {
      platform: os.platform(),
      node: process.version,
      cpus: os.availableParallelism(),
      memory_gib: Math.round(os.totalmem() / 2 ** 30),
    },
    project_id: project.id,
    results: stats,
  };
  await writeFile('benchmark-results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await storage.close();
}
