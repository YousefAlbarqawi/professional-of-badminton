/**
 * Raw SQL against the local stack, for the one kind of fixture PostgREST
 * cannot arrange.
 *
 * Everything else in this suite is set up through the service role client,
 * which is the right tool: it goes through the same API the app does and it
 * only ever bypasses RLS. But `auth.users` is not in the exposed schemas, and
 * one rule in BUILD-SPEC 9.1 — rule 5, `email_not_confirmed` — is a fact about
 * a column in it. GoTrue's admin API can confirm an address and cannot
 * unconfirm one, and with confirmations on (see CONFLICTS FOUND, C4) an
 * unconfirmed account cannot sign in to obtain a session in the first place.
 * So the account is made normally, signed in normally, and then its
 * confirmation is withdrawn behind its back.
 *
 * The connection is the CLI's own Postgres container, reached with docker exec
 * rather than a host psql, because Docker is already a hard requirement for
 * `npm run test:db` and a local psql is not.
 *
 * Arrangement only. Nothing is ever asserted through this.
 */
import { execFileSync } from 'node:child_process';

let containerName: string | null = null;

function dbContainer(): string {
  if (containerName !== null) return containerName;

  const found = execFileSync(
    'docker',
    ['ps', '--filter', 'name=supabase_db_', '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  const name = found[0];
  if (name === undefined) {
    throw new Error('No supabase_db_* container is running. Run `npm run db:start`.');
  }

  containerName = name;
  return name;
}

/** Runs one statement and returns its output as unaligned text rows. */
export function sql(statement: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      dbContainer(),
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  ).trim();
}

/** BUILD-SPEC 9.1 rule 5. Withdraws an account's email confirmation. */
export function unconfirmEmail(userId: string): void {
  sql(`UPDATE auth.users SET email_confirmed_at = NULL WHERE id = '${userId}'`);
}

export function confirmEmail(userId: string): void {
  sql(`UPDATE auth.users SET email_confirmed_at = now() WHERE id = '${userId}'`);
}
