/**
 * Announcement reads and writes. BUILD-SPEC 14.11, 15.11, D69.
 *
 * ── Reads go to the table; writes go to RPCs ─────────────
 * Reading is a policy question and 7.3 answers it: every authenticated account
 * selects every announcement that is not deleted, staff select all of them.
 * So there is one query and both sides of the app use it — the player's list
 * (14.11) and the coach's (15.11) are the same rows, which is the point: he
 * should be looking at what they are looking at.
 *
 * Writing is not a policy question. Publishing is an announcement *and* the
 * push job that tells everyone about it, and 15.11 says publishing "sends a
 * push to every registered device immediately" — an announcement with no job
 * behind it is one nobody was told about. Both rows land in one transaction in
 * `publish_announcement` (migration 0035).
 */
import { supabase } from '@/lib/supabase';
import type { Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import type { Announcement, PublishAnnouncementInput } from './types';

interface AnnouncementRow {
  id: string;
  body: string;
  language: string;
  published_at: string;
  push_sent_at: string | null;
}

function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    body: row.body,
    // 6.2 constrains the column to 'ar' or 'en'; anything else would be a row
    // no version of this app wrote.
    language: (row.language === 'en' ? 'en' : 'ar') satisfies Locale,
    publishedAt: parseInstant(row.published_at),
    pushSentAt: row.push_sent_at === null ? null : parseInstant(row.push_sent_at),
  };
}

/**
 * 14.11: "Reverse chronological list of announcement bodies."
 *
 * A soft deleted announcement is invisible here because the policy hides it,
 * not because of a filter written on the phone — 7.3 is the boundary and a
 * client-side `is_deleted = false` would be presentation dressed as security.
 */
export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, body, language, published_at, push_sent_at')
    .eq('is_deleted', false)
    .order('published_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data as AnnouncementRow[]).map(toAnnouncement);
}

/**
 * One announcement, which is what a notification tap opens (section 18).
 *
 * Returns null when it has been soft deleted since the push went out. 15.11 is
 * explicit that a soft delete "does not recall the push", so this is a real
 * arrival and the screen has to say something rather than spin.
 */
export async function fetchAnnouncement(id: string): Promise<Announcement | null> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, body, language, published_at, push_sent_at')
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) throw error;
  return data === null ? null : toAnnouncement(data as AnnouncementRow);
}

/**
 * How many devices a push would reach. 15.11: "A confirmation dialog states
 * how many devices will receive it."
 *
 * A count of rows and nothing else — `head: true` means no row ever leaves the
 * server, so a coach learns how many phones there are without learning whose.
 * Staff can read `device_tokens` under 7.3; this asks for the least it can.
 */
export async function countPushDevices(): Promise<number> {
  const { count, error } = await supabase
    .from('device_tokens')
    .select('id', { count: 'exact', head: true });

  if (error) throw error;
  return count ?? 0;
}

/** 15.11 and D69. Returns the new announcement's id. */
export async function publishAnnouncement(input: PublishAnnouncementInput): Promise<string> {
  const { data, error } = await supabase.rpc('publish_announcement', {
    p_body: input.body.trim(),
    p_language: input.language,
  });

  if (error) throw error;
  return data as string;
}

/**
 * 15.11's soft delete. It takes the message out of the list; it does not, and
 * cannot, recall a notification already delivered.
 */
export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_announcement', { p_id: id });
  if (error) throw error;
}
