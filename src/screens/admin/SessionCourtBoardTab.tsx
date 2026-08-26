/**
 * The court board. BUILD-SPEC 13.10, reached from 15.2's Court board tab.
 * D68: coach and admin only.
 *
 * ── What the coach sees ───────────────────────────────────
 * "Rotation selector at the top: chips 1 through N, current one highlighted,
 * swipeable. One card per court. Court number as a large heading. Four player
 * tiles per card, arranged two above two, with a dividing line between the
 * teams. Sit-outs in a separate section at the bottom, headed Resting."
 *
 * He reads it aloud across a gym, so nothing here truncates and nothing is
 * under 18pt. 16.2 also exempts this screen from mirroring: court 1 stays
 * leftmost in Arabic, because the board maps to the physical hall.
 *
 * ── Where the lineup comes from ───────────────────────────
 * 13.8: while `has_manual_lineup` is false, a booking change discards the
 * lineup — that is `mark_lineup_stale` in migration 0020, and it deletes
 * rather than rebuilds, because the engine runs on this phone (13.1). So a
 * board that loads and finds no rotations generates them and saves them, and
 * that is the whole of "discards and regenerates automatically".
 *
 * Once he drags, taps or locks anything the flag turns true and the board
 * stops rebuilding itself. Instead it counts what has changed since and offers
 * the Regenerate button, which asks first because it destroys his work.
 *
 * ── Adding a seventh rotation ──────────────────────────────
 * D62/A15: a 2.5 hour session runs six rotations, "and a seventh rotation, if
 * played, uses rule 1" — `ruleForRotation` already returns rule 1 for any odd
 * index, so nothing in the engine changes. The *Add a rotation* button calls
 * `add_rotation` (migration 0038), which raises `rotation_count` by one and
 * hands back the new value, then rebuilds the board for the new count exactly
 * as Regenerate does — including the same confirmation, since it is the same
 * destructive rebuild.
 *
 * ── Two ways to move a player ─────────────────────────────
 * 13.9 requires both. Drag is `CourtTile`'s pan gesture, hit tested against
 * every tile's window rectangle. Tap-to-swap is "required as an accessible
 * alternative to dragging on a small phone", and it is the one that works with
 * a screen reader. Either way the write goes out immediately: "there is no
 * save button", and either way it can be taken back for ten seconds.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { CourtCard, RotationChips } from '@/components/domain';
import { Button, Card, Dialog, SkeletonCard, Text, Toast } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import { useSessionRoster } from '@/features/bookings/queries';
import { findDropTarget, type TileRect } from '@/features/matchmaking/boardLayout';
import type { StoredLineup } from '@/features/matchmaking/boardTypes';
import { generateLineup } from '@/features/matchmaking/engine';
import { lineupErrorMessageKey } from '@/features/matchmaking/errors';
import { buildLineupInput, toBoardPlayers } from '@/features/matchmaking/lineupInput';
import { useSaveLineup, useSetCourtLock, useSwapPlayers } from '@/features/matchmaking/mutations';
import { useLineup, usePairingRules } from '@/features/matchmaking/queries';
import { sessionErrorMessageKey } from '@/features/sessions/errors';
import { useAddRotation } from '@/features/sessions/mutations';
import type { Session } from '@/features/sessions/types';
import { hapticSwap } from '@/lib/haptics';
import { useTheme } from '@/theme';

import {
  canLockCourt,
  courtTeams,
  isLineupStale,
  restingPlayers,
  rotationAt,
  swapRefusal,
} from './courtBoardInteraction';
import { PairingRulesSheet } from './PairingRulesSheet';

/** session_instances' own CHECK. */
const MAX_ROTATIONS = 10;

export interface SessionCourtBoardTabProps {
  session: Session;
  /** 13.7's empty state: "Empty state with a Cancel session button." 15.5. */
  onCancelSession: () => void;
}

/** 13.9: "available for 10 seconds as a toast action". */
const UNDO_WINDOW_MS = 10000;

interface BoardToast {
  message: string;
  tone: 'neutral' | 'danger';
  /** The swap this toast can take back, if any. */
  undo: { rotationId: string; bookingIdA: string; bookingIdB: string } | null;
}

export const SessionCourtBoardTab: React.FC<SessionCourtBoardTabProps> = ({
  session,
  onCancelSession,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const roster = useSessionRoster(session.id);
  const lineup = useLineup(session.id);
  const pairingRules = usePairingRules();

  const saveLineup = useSaveLineup();
  const swapPlayers = useSwapPlayers();
  const setCourtLock = useSetCourtLock();
  const addRotation = useAddRotation();

  const [rotationIndex, setRotationIndex] = useState(1);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [toast, setToast] = useState<BoardToast | null>(null);
  const [isRegenerateOpen, setRegenerateOpen] = useState(false);
  const [isAddRotationOpen, setAddRotationOpen] = useState(false);
  const [isRulesOpen, setRulesOpen] = useState(false);

  const tileNodes = useRef(new Map<string, View>()).current;
  const tileRects = useRef(new Map<string, TileRect>()).current;
  // 13.8's automatic rebuild must happen once per empty board, not once per
  // render. Without this a failing save would retry forever.
  const generatedFor = useRef<string | null>(null);

  const entries = useMemo(() => roster.data ?? [], [roster.data]);
  const players = useMemo(() => toBoardPlayers(entries), [entries]);

  const buildInput = useCallback(
    // A just-added rotation is not on `session` yet — the query invalidation
    // it triggers has not round-tripped — so the caller passes the new count
    // straight through rather than waiting on it.
    (rotationCountOverride?: number) =>
      buildLineupInput({
        session: {
          id: session.id,
          sessionType: session.sessionType,
          courtCount: session.courtCount,
          rotationCount: rotationCountOverride ?? session.rotationCount,
        },
        attendees: entries,
        lockedCourts: lineup.data?.lockedCourts ?? [],
        pairingRules: pairingRules.data ?? [],
      }),
    [entries, lineup.data, pairingRules.data, session],
  );

  const regenerate = useCallback((): void => {
    saveLineup.mutate({ sessionId: session.id, lineup: generateLineup(buildInput()) });
  }, [buildInput, saveLineup, session.id]);

  // 13.8, the automatic half. An empty board with people on the roster is a
  // lineup that was discarded, so it is rebuilt without being asked.
  const isReady = roster.isSuccess && lineup.isSuccess && pairingRules.isSuccess;
  const needsGeneration = isReady && lineup.data === null && entries.length > 0;

  useEffect(() => {
    if (!needsGeneration) return;
    const stamp = `${session.id}:${entries.length}`;
    if (generatedFor.current === stamp) return;
    generatedFor.current = stamp;
    regenerate();
  }, [needsGeneration, regenerate, session.id, entries.length]);

  const confirmRegenerate = useCallback((): void => {
    setRegenerateOpen(false);
    setSelectedBookingId(null);
    generatedFor.current = null;
    regenerate();
  }, [regenerate]);

  const dismissToast = useCallback((): void => setToast(null), []);

  const runSwap = useCallback(
    (rotationId: string, bookingIdA: string, bookingIdB: string, isUndo: boolean): void => {
      swapPlayers.mutate(
        { sessionId: session.id, rotationId, bookingIdA, bookingIdB },
        {
          onSuccess: () => {
            // 17.4: "Haptic feedback on ... court board swaps."
            hapticSwap();
            setToast({
              message: t(isUndo ? 'admin.board.undone' : 'admin.board.swapped'),
              tone: 'neutral',
              undo: isUndo ? null : { rotationId, bookingIdA, bookingIdB },
            });
          },
          onError: (error) =>
            setToast({ message: t(lineupErrorMessageKey(error)), tone: 'danger', undo: null }),
        },
      );
    },
    [session.id, swapPlayers, t],
  );

  const current =
    lineup.data === null || lineup.data === undefined
      ? null
      : rotationAt(lineup.data, rotationIndex);
  const lockedNumbers = useMemo(
    () => (lineup.data?.lockedCourts ?? []).map((court) => court.courtNumber),
    [lineup.data],
  );

  const attemptSwap = useCallback(
    (bookingIdA: string, bookingIdB: string): void => {
      setSelectedBookingId(null);
      if (current === null) return;

      const refusal = swapRefusal(current, lockedNumbers, bookingIdA, bookingIdB);
      if (refusal === 'same_player') return;
      if (refusal === 'court_locked') {
        setToast({ message: t('admin.board.error.courtLocked'), tone: 'danger', undo: null });
        return;
      }

      runSwap(current.id, bookingIdA, bookingIdB, false);
    },
    [current, lockedNumbers, runSwap, t],
  );

  /** 13.9's tap-to-swap: tap to select, tap another to swap, tap again to drop it. */
  const onPressPlayer = useCallback(
    (bookingId: string): void => {
      setSelectedBookingId((previous) => {
        if (previous === null) return bookingId;
        if (previous === bookingId) return null;
        attemptSwap(previous, bookingId);
        return null;
      });
    },
    [attemptSwap],
  );

  const registerNode = useCallback(
    (bookingId: string, node: View | null): void => {
      if (node === null) tileNodes.delete(bookingId);
      else tileNodes.set(bookingId, node);
    },
    [tileNodes],
  );

  // Measured once when the drag begins rather than on release: by then the
  // dragged tile has moved, and a hit test wants where everything started.
  const onDragStart = useCallback((): void => {
    tileRects.clear();
    for (const [bookingId, node] of tileNodes) {
      node.measureInWindow((x, y, width, height) => {
        tileRects.set(bookingId, { x, y, width, height });
      });
    }
  }, [tileNodes, tileRects]);

  const onDrop = useCallback(
    (draggedBookingId: string, x: number, y: number): void => {
      const target = findDropTarget(tileRects, x, y, draggedBookingId);
      if (target !== null) attemptSwap(draggedBookingId, target);
    },
    [attemptSwap, tileRects],
  );

  const toggleLock = useCallback(
    (courtNumber: number, isLocked: boolean): void => {
      if (current === null) return;
      setCourtLock.mutate(
        { sessionId: session.id, rotationId: current.id, courtNumber, isLocked: !isLocked },
        {
          onSuccess: () =>
            setToast({
              message: t(isLocked ? 'admin.board.unlocked' : 'admin.board.locked', {
                court: courtNumber,
              }),
              tone: 'neutral',
              undo: null,
            }),
          onError: (error) =>
            setToast({ message: t(lineupErrorMessageKey(error)), tone: 'danger', undo: null }),
        },
      );
    },
    [current, session.id, setCourtLock, t],
  );

  const openRules = useCallback((): void => setRulesOpen(true), []);
  const closeRules = useCallback((): void => setRulesOpen(false), []);
  const openRegenerate = useCallback((): void => setRegenerateOpen(true), []);
  const closeRegenerate = useCallback((): void => setRegenerateOpen(false), []);
  const openAddRotation = useCallback((): void => setAddRotationOpen(true), []);
  const closeAddRotation = useCallback((): void => setAddRotationOpen(false), []);

  const confirmAddRotation = useCallback((): void => {
    setAddRotationOpen(false);
    addRotation.mutate(session.id, {
      onSuccess: (newRotationCount) => {
        setSelectedBookingId(null);
        generatedFor.current = null;
        saveLineup.mutate({
          sessionId: session.id,
          lineup: generateLineup(buildInput(newRotationCount)),
        });
      },
      onError: (error) =>
        setToast({ message: t(sessionErrorMessageKey(error)), tone: 'danger', undo: null }),
    });
  }, [addRotation, buildInput, saveLineup, session.id, t]);
  const retry = useCallback((): void => {
    void roster.refetch();
    void lineup.refetch();
  }, [lineup, roster]);

  const handleUndo = useCallback((): void => {
    const pending = toast?.undo;
    setToast(null);
    if (pending) runSwap(pending.rotationId, pending.bookingIdA, pending.bookingIdB, true);
  }, [runSwap, toast]);

  if (roster.isPending || lineup.isPending || pairingRules.isPending) {
    return (
      <View style={{ gap: theme.spacing.md }} testID="board-loading">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (roster.isError || lineup.isError || pairingRules.isError) {
    return (
      <ErrorState
        message={t('admin.board.loadError')}
        onRetry={retry}
        isRetrying={roster.isFetching || lineup.isFetching}
        testID="board-error"
      />
    );
  }

  // 13.7, the last row of the table: "Empty state with a Cancel session button."
  if (entries.length === 0) {
    return (
      <EmptyState
        message={t('admin.board.noPlayers')}
        actionLabel={t('admin.board.cancelSession')}
        onAction={onCancelSession}
        testID="board-empty"
      />
    );
  }

  if (lineup.data == null || current === null) {
    return (
      <View style={{ gap: theme.spacing.md }} testID="board-generating">
        <Card>
          <Text variant="body" tone="secondary">
            {t('admin.board.generating')}
          </Text>
        </Card>
        <SkeletonCard />
      </View>
    );
  }

  const board: StoredLineup = lineup.data;
  const resting = restingPlayers(current, players);
  const lockedSet = new Set(lockedNumbers);

  return (
    <View style={{ gap: theme.spacing.md }} testID="court-board">
      {isLineupStale(board) ? (
        <Card testID="board-stale-banner">
          <Text variant="heading" tone="warning">
            {t('admin.board.staleBanner', { count: board.changesSinceGenerated })}
          </Text>
          <Text variant="small" tone="secondary">
            {t('admin.board.staleExplain')}
          </Text>
          <View style={{ paddingTop: theme.spacing.sm }}>
            <Button
              label={t('admin.board.regenerate')}
              onPress={openRegenerate}
              testID="board-regenerate-banner"
            />
          </View>
        </Card>
      ) : null}

      <RotationChips
        indexes={board.rotations.map((rotation) => rotation.index)}
        currentIndex={rotationIndex}
        onSelect={setRotationIndex}
      />

      <Text variant="small" tone="secondary" testID="board-rule">
        {t(current.rule === 'rule_1_similar' ? 'admin.board.ruleSimilar' : 'admin.board.ruleMixed')}
      </Text>

      {/* 13.7: three players share one court, and the coach is told why. */}
      {current.courts.some((court) => court.team1.length + court.team2.length === 3) ? (
        <Card testID="board-three-warning">
          <Text variant="small" tone="warning">
            {t('admin.board.threePlayers')}
          </Text>
        </Card>
      ) : null}

      {current.courts.map((court) => {
        const teams = courtTeams(court, players);
        return (
          <CourtCard
            key={court.courtNumber}
            courtNumber={court.courtNumber}
            team1={teams.team1}
            team2={teams.team2}
            isLocked={lockedSet.has(court.courtNumber)}
            canLock={canLockCourt(court)}
            selectedBookingId={selectedBookingId}
            onToggleLock={() => toggleLock(court.courtNumber, lockedSet.has(court.courtNumber))}
            onPressPlayer={onPressPlayer}
            onDragStart={onDragStart}
            onDrop={onDrop}
            registerNode={registerNode}
            testID={`court-card-${court.courtNumber}`}
          />
        );
      })}

      {resting.length > 0 ? (
        <Card testID="board-resting">
          <Text variant="heading">{t('admin.board.resting')}</Text>
          <View style={{ gap: theme.spacing.sm, paddingTop: theme.spacing.sm }}>
            {resting.map((player) => (
              <Button
                key={player.bookingId}
                label={`${player.firstName} ${player.familyName}`.trim()}
                variant={selectedBookingId === player.bookingId ? 'primary' : 'secondary'}
                onPress={() => onPressPlayer(player.bookingId)}
                testID={`resting-${player.bookingId}`}
              />
            ))}
          </View>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <Button
          label={t('admin.board.regenerate')}
          variant="secondary"
          onPress={openRegenerate}
          testID="board-regenerate"
        />
        {/* D62/A15: a seventh rotation, and any beyond it up to the ceiling,
            added by hand rather than generated automatically. */}
        {session.rotationCount < MAX_ROTATIONS ? (
          <Button
            label={t('admin.board.addRotation')}
            variant="secondary"
            onPress={openAddRotation}
            testID="board-add-rotation"
          />
        ) : null}
        <Button
          label={t('admin.board.pairingRules')}
          variant="ghost"
          onPress={openRules}
          testID="board-pairing-rules"
        />
      </View>

      {/* 13.8: "It asks for confirmation first, because it destroys work." */}
      <Dialog
        isVisible={isRegenerateOpen}
        title={t('admin.board.regenerateTitle')}
        message={t('admin.board.regenerateMessage')}
        confirmLabel={t('admin.board.regenerate')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmRegenerate}
        onCancel={closeRegenerate}
        isConfirming={saveLineup.isPending}
        isDestructive
        testID="board-regenerate-dialog"
      />

      {/* Same destructive rebuild as Regenerate, one rotation longer. */}
      <Dialog
        isVisible={isAddRotationOpen}
        title={t('admin.board.addRotationTitle', { number: session.rotationCount + 1 })}
        message={t('admin.board.addRotationMessage')}
        confirmLabel={t('admin.board.addRotation')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmAddRotation}
        onCancel={closeAddRotation}
        isConfirming={addRotation.isPending || saveLineup.isPending}
        isDestructive
        testID="board-add-rotation-dialog"
      />

      <PairingRulesSheet
        isVisible={isRulesOpen}
        onClose={closeRules}
        attendees={entries}
        rules={pairingRules.data ?? []}
      />

      <Toast
        isVisible={toast !== null}
        message={toast?.message ?? ''}
        tone={toast?.tone ?? 'neutral'}
        {...(toast?.undo
          ? {
              actionLabel: t('admin.board.undo'),
              onAction: handleUndo,
              durationMs: UNDO_WINDOW_MS,
            }
          : {})}
        onDismiss={dismissToast}
        testID="board-toast"
      />
    </View>
  );
};

export default SessionCourtBoardTab;
