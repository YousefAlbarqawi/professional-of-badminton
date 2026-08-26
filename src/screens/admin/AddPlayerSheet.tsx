/**
 * Add a registered player. BUILD-SPEC 15.2, D42, D43.
 *
 * "A search field over registered players, minimum 2 characters, pg_trgm
 * matching on the full name, results showing name, tier, and credit balance.
 * Selecting one shows a confirmation sheet:
 *   - If he has credits: 'Use 1 credit' preselected, with 'Cash instead'
 *   - If he does not: 'Cash, marked paid' preselected, per D43
 *   - Blocked if he is already booked, with the reason shown"
 *
 * D42 is what this is for: the coach adds somebody without that player logging
 * in. He is standing in front of him.
 *
 * The search is debounced by 300ms rather than fired per keystroke. The query
 * runs a trigram similarity over every profile, and the coach types faster
 * than the network answers.
 *
 * The results section appears as soon as *he* has typed two characters, while
 * the query itself waits for the debounce. Gating both on the debounced value
 * would leave the sheet looking inert for 300ms after every keystroke, which
 * on a search field reads as a broken field rather than a considered one.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PlayerRow } from '@/components/domain';
import { Button, Chip, Input, Sheet, Text } from '@/components/primitives';
import { bookingErrorMessageKey } from '@/features/bookings/errors';
import { useAddPlayer } from '@/features/bookings/mutations';
import { usePlayerSearch } from '@/features/bookings/queries';
import { isSearchable, SEARCH_DEBOUNCE_MS } from '@/features/bookings/schemas';
import type { PlayerSearchResult } from '@/features/bookings/types';
import { formatSessionDate, parseInstant } from '@/lib/time';
import { useTheme } from '@/theme';

export interface AddPlayerSheetProps {
  isVisible: boolean;
  sessionId: string;
  onClose: () => void;
}

export const AddPlayerSheet: React.FC<AddPlayerSheetProps> = ({
  isVisible,
  sessionId,
  onClose,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const addPlayer = useAddPlayer();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<PlayerSearchResult | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const results = usePlayerSearch(sessionId, debounced);

  const close = useCallback((): void => {
    setQuery('');
    setDebounced('');
    setSelected(null);
    addPlayer.reset();
    onClose();
  }, [addPlayer, onClose]);

  const back = useCallback((): void => {
    setSelected(null);
    addPlayer.reset();
  }, [addPlayer]);

  const add = useCallback(
    (useCredit: boolean): void => {
      if (selected === null) return;
      addPlayer.mutate({ sessionId, playerId: selected.playerId, useCredit }, { onSuccess: close });
    },
    [addPlayer, close, selected, sessionId],
  );

  const addWithCredit = useCallback((): void => add(true), [add]);
  const addWithCash = useCallback((): void => add(false), [add]);

  const creditLine = useMemo((): string | null => {
    if (selected === null || selected.credits <= 0) return null;
    if (selected.creditExpires === null) {
      return t('admin.addPlayer.credits', { count: selected.credits });
    }

    return t('admin.addPlayer.useCreditSub', {
      count: selected.credits,
      // Midday UTC sits inside the same Amman calendar day either way.
      date: formatSessionDate(parseInstant(`${selected.creditExpires}T12:00:00Z`), theme.locale),
    });
  }, [selected, t, theme.locale]);

  return (
    <Sheet
      isVisible={isVisible}
      title={
        selected === null
          ? t('admin.addPlayer.title')
          : t('admin.addPlayer.confirmTitle', { name: selected.displayName })
      }
      onClose={close}
      isDismissDisabled={addPlayer.isPending}
      testID="add-player-sheet"
    >
      {selected === null ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Input
            label={t('admin.addPlayer.searchLabel')}
            value={query}
            onChangeText={setQuery}
            hint={t('admin.addPlayer.searchHint')}
            autoCapitalize="words"
            autoCorrect={false}
            testID="player-search"
          />

          {!isSearchable(query) ? null : results.isPending ? (
            <Text variant="small" tone="tertiary" testID="player-search-loading">
              {t('common.loading')}
            </Text>
          ) : (results.data ?? []).length === 0 ? (
            <Text variant="body" tone="secondary" testID="player-search-empty">
              {t('admin.addPlayer.noResults')}
            </Text>
          ) : (
            (results.data ?? []).map((result) => (
              <PlayerRow
                key={result.playerId}
                name={result.displayName}
                tier={result.tier}
                caption={
                  result.isBooked
                    ? t('admin.addPlayer.alreadyBooked')
                    : t('admin.addPlayer.credits', { count: result.credits })
                }
                // 15.2: blocked if he is already booked, with the reason shown.
                // Shown and greyed, not hidden: the coach searched for him and
                // needs to know why he cannot add him again. The handler goes
                // away with the action rather than being guarded inside it, so
                // the row is inert rather than merely looking inert.
                isDisabled={result.isBooked}
                onPress={result.isBooked ? undefined : () => setSelected(result)}
                testID={`player-result-${result.playerId}`}
              />
            ))
          )}
        </View>
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          <PlayerRow name={selected.displayName} tier={selected.tier} testID="player-selected" />

          {selected.credits > 0 ? (
            <View style={{ gap: theme.spacing.sm }}>
              {/* D43: one credit is deducted if he has a subscription. 15.2
                  preselects it, which here means giving it the primary button
                  and cash the secondary one. */}
              <Button
                label={t('admin.addPlayer.useCredit')}
                onPress={addWithCredit}
                isLoading={addPlayer.isPending}
                isFullWidth
                testID="player-add-credit"
              />
              {creditLine === null ? null : (
                <Text variant="small" tone="secondary">
                  {creditLine}
                </Text>
              )}
              <Button
                label={t('admin.addPlayer.useCash')}
                onPress={addWithCash}
                variant="secondary"
                isFullWidth
                testID="player-add-cash"
              />
              <Text variant="small" tone="tertiary">
                {t('admin.addPlayer.useCashSub')}
              </Text>
            </View>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              {/* D43 again: no subscription means cash, marked paid, editable
                  during review. */}
              <Button
                label={t('admin.addPlayer.cashOnly')}
                onPress={addWithCash}
                isLoading={addPlayer.isPending}
                isFullWidth
                testID="player-add-cash"
              />
              <Text variant="small" tone="secondary">
                {t('admin.addPlayer.cashOnlySub')}
              </Text>
            </View>
          )}

          {addPlayer.isError ? (
            <Chip
              label={t(bookingErrorMessageKey(addPlayer.error))}
              tone="danger"
              testID="player-add-error"
            />
          ) : null}

          <Button
            label={t('common.back')}
            onPress={back}
            variant="ghost"
            isFullWidth
            testID="player-add-back"
          />
        </View>
      )}
    </Sheet>
  );
};

export default AddPlayerSheet;
