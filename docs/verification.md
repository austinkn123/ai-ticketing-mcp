# Verification record

Verified on 2026-11-16. The application was built and exercised against real PostgreSQL with pgvector, the official MCP SDK clients, Keycloak, and local Ollama.

## Functional checks

- Strict TypeScript checking and production build.
- Unit checks for input boundaries, embedding protocols and chunking, architecture imports, Conventional Commits, and credential detection.
- PostgreSQL contract checks for rollback, simultaneous claims, automatic work distribution, retries, stale leases, ordered events, search coverage, index freshness, and job fencing.
- Workflow checks for independent/human/self review, requirement invalidation, snapshots, combined dependency/parent cycles, child completion, checkpoint recovery, questions, access control, and archived content.
- MCP interoperability through stdio and OAuth-protected HTTP, including typed tool outputs, resources, and prompts.
- Expired tokens, incorrect audiences, missing scopes, and rejected HTTP origins.
- A real Keycloak service-account token successfully authenticated an MCP client.
- The Compose deployment starts with a separate runtime database role, and the two-agent walkthrough reaches independently approved completion.
- A PostgreSQL custom-format backup restored into a separate database; ordered row hashes matched for identities, projects, permissions, tickets, criteria, relationships, notes, claims, submissions, reviews, knowledge, events, receipts, jobs, and migrations.

## Load test

100,000 synthetic tickets, 768-dimensional synthetic vectors, and 32 concurrent agents. The application and PostgreSQL were each capped at 2 vCPU and 4 GiB. PostgreSQL had 512 MiB shared memory. The underlying Docker VM reported 2 GiB of physical memory; other validation services were stopped during the isolated measurement.

| Operation               | Requests |   p50 |    p95 | Maximum |
| ----------------------- | -------: | ----: | -----: | ------: |
| Ticket reads            |      160 | 16 ms |  86 ms |  132 ms |
| Ticket writes           |      160 | 89 ms | 173 ms |  207 ms |
| Atomic next-work claims |       32 | 97 ms | 163 ms |  168 ms |
| Hybrid retrieval        |      160 | 50 ms | 100 ms |  131 ms |

This measures application operations with real database I/O. It excludes HTTP transport and embedding inference, uses a synthetic corpus, and is not a service-level guarantee. Coverage reporting is cached for five seconds; permissions and returned source revisions are checked on every query.

The tests exposed and fixed a PostgreSQL shared-memory limit, an inefficient queue ordering query, repeated candidate validation, and repeated full index-coverage counts. Reproduce with `npm run benchmark` and a disposable database. Set `BENCHMARK_PROJECT_ID` to reuse a seeded benchmark project; the rerun still adds notes and claims.

## Checks requiring operator infrastructure

Hosted embeddings were verified against an OpenAI-compatible HTTP fixture, without spending against a live hosted API account. Public HTTPS/domain routing and an interactive human login were not exercised; the included local Keycloak server and signed-token authentication were exercised. PostgreSQL is the only supported production storage adapter; replacement adapters must run the exported contract tests.
