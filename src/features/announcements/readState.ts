/**
 * Which announcements this phone has already read.
 *
 * BUILD-SPEC 14.11: "Unread ones carry a dot; read state is local to the
 * device."
 *
 * Local to the device is the whole specification here, and it is why there is
 * no table for this. Two consequences, both intended: a player who signs in on
 * a second phone sees every announcement as new, and the coach cannot tell who
 * has read what. The second one matters — a read receipt on a message from
 * your coach is a different product from the one D69 describes.
 *
 * AsyncStorage rather than secure store, per CLAUDE.md: tokens go in the
 * keychain, cache goes here, and a list of ids somebody has looked at is
 * cache.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const READ_STORAGE_KEY = 'pob.announcements.read';

/**
 * How many ids are kept. `fetchAnnouncements` asks for 200, so anything older
 * than this cap is no longer reachable to be marked unread, and an unbounded
 * list on a phone that never reinstalls is the alternative.
 */
const MAX_TRACKED = 300;

export function parseReadIds(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    // A corrupted key is a phone that forgets what it read, not a phone that
    // fails to open the tab.
    return [];
  }
}

/** Most recently read first, so the cap drops the oldest. */
export function addReadId(current: readonly string[], id: string): string[] {
  return [id, ...current.filter((existing) => existing !== id)].slice(0, MAX_TRACKED);
}

export interface AnnouncementReadState {
  isRead: (id: string) => boolean;
  markRead: (id: string) => void;
  /** True until the stored list has been loaded, so no dot flashes on first paint. */
  isLoading: boolean;
}

export function useAnnouncementReadState(): AnnouncementReadState {
  const [readIds, setReadIds] = useState<string[] | null>(null);

  useEffect(() => {
    let isMounted = true;

    void AsyncStorage.getItem(READ_STORAGE_KEY)
      .then((raw) => {
        if (isMounted) setReadIds(parseReadIds(raw));
      })
      .catch(() => {
        if (isMounted) setReadIds([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const read = useMemo(() => new Set(readIds ?? []), [readIds]);

  const markRead = useCallback((id: string): void => {
    setReadIds((current) => {
      const next = addReadId(current ?? [], id);
      void AsyncStorage.setItem(READ_STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const isRead = useCallback((id: string): boolean => read.has(id), [read]);

  return { isRead, markRead, isLoading: readIds === null };
}
