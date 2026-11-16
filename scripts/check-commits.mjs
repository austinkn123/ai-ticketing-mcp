import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function validateCommit(message) {
  const [header, ...body] = message.trim().split(/\r?\n/);
  if (
    !/^(feat|fix|refactor|perf|docs|test|build|ci|chore|revert)(\([a-z0-9][a-z0-9/-]*\))?!?: \S.+$/.test(
      header ?? '',
    )
  )
    return 'Use type(scope): description with a Conventional Commit type.';
  if (header.includes('!:') && !body.some((line) => /^BREAKING CHANGE: \S/.test(line)))
    return 'Breaking commits require a BREAKING CHANGE: footer explaining migration.';
  return null;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const range = process.argv[2];
  const messages = range
    ? execFileSync('git', ['log', '--format=%B%x00', range], { encoding: 'utf8' })
        .split('\0')
        .map((s) => s.trim())
        .filter(Boolean)
    : [execFileSync('git', ['log', '-1', '--format=%B'], { encoding: 'utf8' })];
  if (process.env.PR_TITLE) messages.push(`${process.env.PR_TITLE}\n\n${process.env.PR_BODY ?? ''}`);
  const errors = messages
    .map((message) => ({ header: message.split('\n')[0], error: validateCommit(message) }))
    .filter((result) => result.error);
  for (const result of errors) process.stderr.write(`${result.header}: ${result.error}\n`);
  if (errors.length) process.exitCode = 1;
  else process.stdout.write(`Validated ${messages.length} Conventional Commit message(s).\n`);
}
