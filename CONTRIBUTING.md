# Contributing

Use Node.js 24+, PostgreSQL 17 with pgvector, and the checks in the README. Keep domain behavior in the application layer and implementation details inside adapters. Changes to concurrency or authorization need tests against the real database.

## Conventional Commits

Every commit and pull request title must use:

```text
type(optional-scope): concise description
```

Allowed types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, and `revert`. Useful scopes include `core`, `mcp`, `storage`, `postgres`, `search`, `auth`, and `ci`.

```text
feat(storage): support conditional work claims
fix(auth): reject tokens for a different audience
docs(adapters): explain atomicity requirements
feat(mcp)!: rename the context response field

BREAKING CHANGE: Clients must read latest_checkpoint instead of checkpoint.
```

For a breaking pull request title, include the same `BREAKING CHANGE:` migration footer in its description. CI checks every commit added by a PR and its proposed squash title. Configure squash merges so the PR description is retained in the final commit.

Check locally with `npm run commit:check` or `node scripts/check-commits.mjs BASE..HEAD`. Keep commits focused and avoid unrelated refactors. No automatic publishing or release process runs from commit messages.

## Compatibility

Public MCP inputs/outputs and exported adapter interfaces use semantic versioning. A breaking change needs a major version and migration guidance. New database migrations are append-only after release. Never change an already released migration to alter deployed databases.

Run the exported adapter contract suite for a new backend. Do not implement atomic claims, durable cursors, or idempotency as best-effort operations.
