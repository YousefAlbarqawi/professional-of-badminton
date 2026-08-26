/**
 * send-push
 *
 * BUILD-SPEC 8.7, 8.4 step 4, section 18, D70.
 *
 * ── What it is ───────────────────────────────────────────
 * A drain. It claims whatever the database has decided to send, resolves each
 * job's devices to Expo messages in each device's own language, sends them,
 * and records the tickets. Before any of that it settles the receipts of the
 * previous run, which is where dead tokens actually die.
 *
 * ── What it is not ───────────────────────────────────────
 * It is not told what to send. 8.7 describes it as taking "a list of player
 * ids and a payload", and it deliberately does not: the caller is an ordinary
 * signed-in phone — the coach who just published (15.11), or the player whose
 * cancellation freed a spot (8.3 step 7) — and a phone that could name its own
 * audience could push anything to anyone. The request body carries nothing but
 * an optional batch size.
 *
 * The consequence worth stating plainly: D28's one hour rule is not enforced
 * here. `notify_waitlist` enqueues nothing when a spot opens inside the last
 * hour, so there is nothing here to find. The silence is a property of the
 * database, and no request to this function can produce a notification the
 * database did not already write down.
 *
 * ── D70 ──────────────────────────────────────────────────
 * Two kinds, both from `push_job_kind`, which has two values. A job of any
 * other shape cannot exist, so this function has no third branch and no way to
 * grow one without a migration.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

import { formatAmmanTime } from '../_shared/ammanTime.ts';
import {
  announcementContent,
  waitlistContent,
  type PushContent,
  type PushLocale,
} from '../_shared/pushStrings.ts';
import {
  fetchExpoReceipts,
  sendExpoMessages,
  type ExpoMessage,
  type TicketResult,
} from '../_shared/expoPush.ts';

/** Android requires a channel id; `default` is the one expo-notifications creates. */
const ANDROID_CHANNEL_ID = 'default';

const DEFAULT_JOB_BATCH = 5;
const RECEIPT_BATCH = 300;

interface DeviceRow {
  token?: string;
  locale?: string;
}

interface ClaimedJob {
  jobId: string;
  kind: 'waitlist_spot' | 'announcement';
  sessionId: string | null;
  announcementId: string | null;
  payload: Record<string, unknown>;
  devices: DeviceRow[];
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function readLocale(value: string | undefined): PushLocale {
  // 16.1 makes Arabic the default, and `device_tokens.locale` defaults to it
  // too. A row carrying anything else is a row written by a version of the app
  // that does not exist.
  return value === 'en' ? 'en' : 'ar';
}

function readString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Section 18's two rows, and the deep link each one carries.
 *
 * `data` is what the tap handler reads on the phone —
 * `src/features/notifications/deepLinks.ts` parses exactly these two shapes.
 * The id travels in the notification rather than being looked up on open,
 * because the player may tap it days later or with no signal.
 */
function composeMessages(job: ClaimedJob): ExpoMessage[] {
  const messages: ExpoMessage[] = [];

  for (const device of job.devices) {
    const token = device.token;
    if (typeof token !== 'string' || token.length === 0) continue;

    const locale = readLocale(device.locale);
    let content: PushContent;
    let data: Record<string, string>;

    if (job.kind === 'waitlist_spot') {
      if (job.sessionId === null) continue;
      content = waitlistContent(
        {
          venue: readString(job.payload, locale === 'en' ? 'venueEn' : 'venueAr'),
          time: formatAmmanTime(readString(job.payload, 'startsAt'), locale),
        },
        locale,
      );
      data = { type: 'waitlist_spot', sessionId: job.sessionId };
    } else {
      if (job.announcementId === null) continue;
      content = announcementContent({ preview: readString(job.payload, 'preview') }, locale);
      data = { type: 'announcement', announcementId: job.announcementId };
    }

    messages.push({
      to: token,
      title: content.title,
      body: content.body,
      data,
      sound: 'default',
      channelId: ANDROID_CHANNEL_ID,
      priority: 'high',
    });
  }

  return messages;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    return json({ error: 'not_configured' }, 500);
  }

  // The platform verifies the JWT before this runs, so reaching here means a
  // real account asked for a drain. Which account it is does not matter and is
  // deliberately not read: the request cannot influence what gets sent.
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let pruned = 0;

  // ── 1. Last run's receipts ──────────────────────────────
  // Section 18: "Dead tokens returned by Expo's receipt API are deleted."
  // Expo has no receipt the instant it issues a ticket, so this is always
  // cleaning up after an earlier invocation rather than this one.
  try {
    const { data: due } = await admin.rpc('pending_push_receipts', {
      p_limit: RECEIPT_BATCH,
      p_min_age_seconds: 20,
    });

    const rows: { ticketId?: string }[] = Array.isArray(due) ? due : [];
    const ticketIds = rows
      .map((row) => row.ticketId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (ticketIds.length > 0) {
      const receipts = await fetchExpoReceipts(ticketIds);
      if (receipts.length > 0) {
        const { data: prunedCount } = await admin.rpc('settle_push_receipts', {
          p_results: receipts,
        });
        pruned += Number(prunedCount ?? 0);
      }
    }
  } catch (error) {
    // A cleanup failure must never cost a notification. The tickets stay
    // unchecked and the next drain asks again.
    console.error('receipt sweep failed', error);
  }

  // ── 2. This run's jobs ──────────────────────────────────
  const requested = await request
    .json()
    .then((body: unknown) =>
      typeof body === 'object' && body !== null && 'limit' in body
        ? Number((body as { limit: unknown }).limit)
        : Number.NaN,
    )
    .catch(() => Number.NaN);
  const limit =
    Number.isFinite(requested) && requested > 0 ? Math.min(requested, 20) : DEFAULT_JOB_BATCH;

  const { data: claimed, error: claimError } = await admin.rpc('claim_push_jobs', {
    p_limit: limit,
  });

  if (claimError) {
    console.error('claim_push_jobs failed', claimError);
    return json({ error: 'claim_failed' }, 500);
  }

  const jobs: ClaimedJob[] = Array.isArray(claimed) ? (claimed as ClaimedJob[]) : [];
  let sent = 0;

  for (const job of jobs) {
    const messages = composeMessages(job);

    // Nobody on the list has a registered device. That is a finished job, not
    // a failed one: retrying would find the same nobody.
    if (messages.length === 0) {
      await admin.rpc('complete_push_job', { p_job_id: job.jobId, p_tickets: [] });
      continue;
    }

    let tickets: TicketResult[];
    try {
      tickets = await sendExpoMessages(messages);
    } catch (error) {
      console.error('expo send failed', job.jobId, error);
      await admin.rpc('fail_push_job', {
        p_job_id: job.jobId,
        p_error: error instanceof Error ? error.message : 'send_failed',
      });
      continue;
    }

    const { data: prunedNow, error: completeError } = await admin.rpc('complete_push_job', {
      p_job_id: job.jobId,
      p_tickets: tickets,
    });

    if (completeError) {
      // Expo has the messages. Saying so is the only honest thing left, and
      // the claim expiry will not re-send because `sent_at` is what gates a
      // reclaim and the write that would have set it is the one that failed.
      console.error('complete_push_job failed', job.jobId, completeError);
      continue;
    }

    pruned += Number(prunedNow ?? 0);
    sent += tickets.filter((ticket) => ticket.status === 'ok').length;
  }

  return json({ ok: true, jobs: jobs.length, sent, pruned }, 200);
});
