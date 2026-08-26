/**
 * Announcement mutations. BUILD-SPEC 15.11.
 *
 * ── Neither is optimistic ────────────────────────────────
 * 17.4 asks for optimistic feedback "where safe". Publishing is not safe for
 * it: the row and its push job land together and the coach is about to be told
 * how many phones just buzzed. Showing the announcement in the list before the
 * server has agreed to send it would put a message on his screen that may not
 * have gone anywhere.
 *
 * ── The drain is not part of the mutation ────────────────
 * Publishing succeeds when Postgres has the announcement and the job. Sending
 * happens afterwards, and it is deliberately not something the coach waits on
 * or is told about: he has no lever if it fails, the job is durable, and the
 * next drain picks it up. So the nudge runs after `onSuccess` and swallows its
 * own errors (`drainPushQueue`).
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { drainPushQueue } from '@/features/notifications/api';

import { deleteAnnouncement, publishAnnouncement } from './api';
import { announcementKeys } from './queries';
import type { PublishAnnouncementInput } from './types';

/** 15.11 and D69. Resolves to the new announcement's id. */
export function usePublishAnnouncement(): UseMutationResult<
  string,
  Error,
  PublishAnnouncementInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PublishAnnouncementInput) => publishAnnouncement(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: announcementKeys.all });
      void drainPushQueue();
    },
  });
}

/**
 * 15.11's soft delete.
 *
 * No drain, and nothing that touches the outbox: "which does not recall the
 * push". A notification already delivered stays delivered, and one already
 * enqueued still goes out. That is not an oversight to be tidied up later —
 * the alternative would be an announcement the coach believes he unsent.
 */
export function useDeleteAnnouncement(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAnnouncement(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: announcementKeys.all });
    },
  });
}
