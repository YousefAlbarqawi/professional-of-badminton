/**
 * Announcements. BUILD-SPEC 14.11, 15.11, D69.
 */
import type { Locale } from '@/lib/money';

export interface Announcement {
  id: string;
  body: string;
  /** What the author said he was typing. D69: one message, one language. */
  language: Locale;
  publishedAt: Date;
  /** Null until the outbox has actually sent it. 15.11's list shows the difference. */
  pushSentAt: Date | null;
}

export interface PublishAnnouncementInput {
  body: string;
  language: Locale;
}
