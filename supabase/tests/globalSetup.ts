import { execFileSync } from 'node:child_process';

/**
 * Reads the local stack's URL and keys straight from the CLI, so the tests
 * never carry a hardcoded key and never need a .env file. Anything already
 * present in the environment wins, which is what lets CI point them elsewhere.
 */
export default function globalSetup(): void {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) return;

  let raw: string;
  try {
    raw = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
  } catch {
    throw new Error(
      'Could not read the local Supabase status. Run `npm run db:start` before `npm run test:db`.',
    );
  }

  const values = new Map<string, string>();
  for (const line of raw.split('\n')) {
    const match = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
    if (match?.[1] && match[2]) values.set(match[1], match[2]);
  }

  const url = values.get('API_URL');
  const anonKey = values.get('ANON_KEY');
  const serviceKey = values.get('SERVICE_ROLE_KEY');

  if (!url || !anonKey || !serviceKey) {
    throw new Error('The local Supabase stack is not running. Run `npm run db:start`.');
  }

  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_ANON_KEY = anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
}
