/**
 * One court on the court board. BUILD-SPEC 13.10.
 *
 * "One card per court. Court number as a large heading. Four player tiles per
 * card, arranged two above two, with a dividing line between the teams."
 *
 * A singles court draws two tiles rather than four, one a side, which is
 * 13.7's partial court. On exactly three attendees one side has two and the
 * other one, and the card is the same shape either way.
 *
 * 13.9: "Long press a court to lock it." The gesture is on the header rather
 * than on the whole card, because the tiles inside carry a drag that also
 * begins with a hold, and two hold gestures competing for the same pixels is a
 * board that locks itself when the coach meant to move somebody.
 */
import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/primitives';
import type { BoardPlayer } from '@/features/matchmaking/boardTypes';
import { boardRowDirection } from '@/features/matchmaking/boardLayout';
import { useTheme } from '@/theme';

import { CourtTile } from './CourtTile';

export interface CourtCardProps {
  courtNumber: number;
  team1: readonly BoardPlayer[];
  team2: readonly BoardPlayer[];
  isLocked: boolean;
  /** 13.4 rule 3: only a court of four can be locked. */
  canLock: boolean;
  selectedBookingId: string | null;
  onToggleLock: () => void;
  onPressPlayer: (bookingId: string) => void;
  onDragStart: () => void;
  onDrop: (bookingId: string, x: number, y: number) => void;
  registerNode: (bookingId: string, node: View | null) => void;
  testID?: string;
}

export const CourtCard: React.FC<CourtCardProps> = ({
  courtNumber,
  team1,
  team2,
  isLocked,
  canLock,
  selectedBookingId,
  onToggleLock,
  onPressPlayer,
  onDragStart,
  onDrop,
  registerNode,
  testID,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const rowDirection = boardRowDirection(theme.isRTL);

  const renderTeam = useCallback(
    (players: readonly BoardPlayer[], team: 1 | 2) => (
      <View style={{ flexDirection: rowDirection, gap: theme.spacing.sm }}>
        {players.map((player) => (
          <CourtTile
            key={player.bookingId}
            player={player}
            isSelected={selectedBookingId === player.bookingId}
            isLocked={isLocked}
            accessibilityLabel={t('admin.board.tileLabel', {
              name: `${player.firstName} ${player.familyName}`.trim(),
              court: courtNumber,
              team,
            })}
            onPress={() => onPressPlayer(player.bookingId)}
            onDragStart={onDragStart}
            onDrop={(x, y) => onDrop(player.bookingId, x, y)}
            registerNode={(node) => registerNode(player.bookingId, node)}
            testID={`court-tile-${player.bookingId}`}
          />
        ))}
      </View>
    ),
    [
      courtNumber,
      isLocked,
      onDragStart,
      onDrop,
      onPressPlayer,
      registerNode,
      rowDirection,
      selectedBookingId,
      t,
      theme.spacing.sm,
    ],
  );

  return (
    <View
      testID={testID}
      style={{
        backgroundColor: theme.colors.bgElevated,
        borderRadius: theme.radii.md,
        borderWidth: isLocked ? 2 : 1,
        borderColor: isLocked ? theme.colors.accent : theme.colors.border,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
      }}
    >
      <Pressable
        onLongPress={canLock || isLocked ? onToggleLock : undefined}
        accessibilityRole="button"
        accessibilityLabel={t(isLocked ? 'admin.board.unlockCourt' : 'admin.board.lockCourt', {
          court: courtNumber,
        })}
        accessibilityState={{ disabled: !canLock && !isLocked }}
        testID={`court-header-${courtNumber}`}
        style={{
          flexDirection: rowDirection,
          alignItems: 'center',
          gap: theme.spacing.sm,
          minHeight: theme.minTouchTarget,
        }}
      >
        <Text variant="title" style={{ flex: 1 }}>
          {t('admin.board.court', { number: courtNumber })}
        </Text>
        {isLocked ? (
          <Text variant="heading" tone="accent" testID={`court-lock-${courtNumber}`}>
            {t('admin.board.lockedBadge')}
          </Text>
        ) : null}
      </Pressable>

      {renderTeam(team1, 1)}

      <View style={{ height: 1, backgroundColor: theme.colors.border }} />

      {renderTeam(team2, 2)}
    </View>
  );
};

export default CourtCard;
