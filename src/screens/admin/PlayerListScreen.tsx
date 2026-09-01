/**
 * The player list. BUILD-SPEC 15.7.
 *
 * "Searchable, filterable by tier, by visibility level, by 'has an active
 * subscription', and by 'owes money'. Sortable by name, tier, or amount owed.
 * Each row: name, tier badge, visibility level chip, credits remaining, and
 * amount owed when non-zero."
 *
 * ── Why this screen is in phase 6 ─────────────────────────
 * Section 20 assigns 15.7 to no phase. 14.0 assigns it a place: it is the root
 * of the Players stack, and 15.9 and 15.10 — this phase's two screens — hang
 * off it. Phase 5 gave the player profile one other way in, from the review
 * screen, but the people 11.3's migration exists for are mid-subscription
 * today and need not appear on any recent review screen. Without this list the
 * flow this phase is measured by cannot be reached for exactly the players it
 * is for. Recorded as an assumption in section 21.
 *
 * ── Filtering happens on the server ───────────────────────
 * Two of the four filters are facts about sums over other tables — a live
 * credit balance (D56: the ledger, never a counter) and what he owes — and the
 * sort by amount owed needs the same sums. `search_players` (migration 0031)
 * computes them; filtering here would mean fetching every player in order to
 * hide most of them.
 *
 * ── What a row does not do ────────────────────────────────
 * Nothing on it blocks anything. D40: "Balances never block a booking. They
 * are a record, not a gate." The debt column is information the coach asked
 * for, and the row it sits on is a link to a profile.
 *
 * ── Paged, forward only ────────────────────────────────────
 * OPEN-ITEMS.md recorded this list as unpaged while one page held the whole
 * roster (1.4's "roughly 100 to 300 registered players"). `usePlayerDirectory`
 * walks `search_players`' cursor (migration 0041) forward on `onEndReached`;
 * changing a filter or the sort starts over from the first page, since it is a
 * different question with a different first answer.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PlayerRow } from '@/components/domain';
import { Button, Chip, Input, Skeleton, SkeletonCard, Text } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import { usePlayerDirectory } from '@/features/players/queries';
import {
  DEFAULT_PLAYER_FILTERS,
  type DirectoryPlayer,
  type PlayerFilters,
  type PlayerSort,
  type VisibilityLevel,
} from '@/features/players/types';
import { subscriptionErrorMessageKey } from '@/features/subscriptions/errors';
import { formatMoney } from '@/lib/money';
import { TIERS, type Tier } from '@/lib/tiers';
import { useTheme } from '@/theme';
import type { PlayersStackParamList } from '@/app/types';

type Props = NativeStackScreenProps<PlayersStackParamList, 'PlayerList'>;

const SORTS: readonly { value: PlayerSort; labelKey: string }[] = [
  { value: 'name', labelKey: 'admin.players.sortName' },
  { value: 'tier', labelKey: 'admin.players.sortTier' },
  { value: 'owed', labelKey: 'admin.players.sortOwed' },
];

const VISIBILITY_LABELS: Record<VisibilityLevel, string> = {
  level_0: 'admin.players.visibility0',
  level_1: 'admin.players.visibility1',
  level_2: 'admin.players.visibility2',
};

interface ToggleChipProps {
  label: string;
  isOn: boolean;
  onPress: () => void;
  testID: string;
}

/**
 * A chip that is also a button. 17.4's 44pt rule is met by the row's own
 * padding; the chip carries its state in its tone *and* in being pressed, and
 * the label never changes, so a screen reader hears the filter name and its
 * selected state rather than two different words.
 */
const ToggleChip: React.FC<ToggleChipProps> = ({ label, isOn, onPress, testID }) => (
  <View accessibilityRole="button" accessibilityState={{ selected: isOn }}>
    <Button label={label} onPress={onPress} variant={isOn ? 'primary' : 'ghost'} testID={testID} />
  </View>
);

export const PlayerListScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const [filters, setFilters] = useState<PlayerFilters>(DEFAULT_PLAYER_FILTERS);
  const [isShowingFilters, setIsShowingFilters] = useState(false);

  const directory = usePlayerDirectory(filters);

  const setQuery = useCallback(
    (query: string): void => setFilters((current) => ({ ...current, query })),
    [],
  );

  const setSort = useCallback(
    (sort: PlayerSort): void => setFilters((current) => ({ ...current, sort })),
    [],
  );

  // Each filter is tri-state: pressing an active one clears it, which is how a
  // coach gets back to "everybody" without hunting for a reset.
  const toggleTier = useCallback(
    (tier: Tier): void =>
      setFilters((current) => ({ ...current, tier: current.tier === tier ? null : tier })),
    [],
  );

  const toggleVisibility = useCallback(
    (level: VisibilityLevel): void =>
      setFilters((current) => ({
        ...current,
        visibility: current.visibility === level ? null : level,
      })),
    [],
  );

  const toggleHasSubscription = useCallback(
    (): void =>
      setFilters((current) => ({
        ...current,
        hasSubscription: current.hasSubscription === true ? null : true,
      })),
    [],
  );

  const toggleOwesMoney = useCallback(
    (): void =>
      setFilters((current) => ({
        ...current,
        owesMoney: current.owesMoney === true ? null : true,
      })),
    [],
  );

  const clearFilters = useCallback(
    (): void => setFilters((current) => ({ ...DEFAULT_PLAYER_FILTERS, query: current.query })),
    [],
  );

  const toggleFilterPanel = useCallback((): void => setIsShowingFilters((showing) => !showing), []);

  const refetch = useCallback((): void => {
    void directory.refetch();
  }, [directory]);

  const loadMore = useCallback((): void => {
    if (directory.hasNextPage && !directory.isFetchingNextPage) {
      void directory.fetchNextPage();
    }
  }, [directory]);

  const openProfile = useCallback(
    (playerId: string): void => navigation.navigate('PlayerProfile', { playerId }),
    [navigation],
  );

  const hasFilters =
    filters.tier !== null ||
    filters.visibility !== null ||
    filters.hasSubscription !== null ||
    filters.owesMoney !== null;

  const players = useMemo(
    () => directory.data?.pages.flatMap((page) => page.players) ?? [],
    [directory.data],
  );

  const renderItem = useCallback(
    ({ item }: { item: DirectoryPlayer }): React.ReactElement => (
      <PlayerRow
        name={item.fullName}
        tier={item.tier}
        caption={t('admin.players.credits', { count: item.credits })}
        onPress={() => openProfile(item.id)}
        testID={`player-${item.id}`}
        trailing={
          <View style={{ alignItems: 'flex-end', gap: theme.spacing.xs }}>
            <Chip label={t(VISIBILITY_LABELS[item.visibility])} tone="neutral" />
            {/* 15.7: "amount owed when non-zero". A zero is not news. */}
            {item.owedFils === 0 ? null : (
              <Text variant="caption" tone="warning" testID={`player-owed-${item.id}`}>
                {t('admin.players.owes', {
                  amount: formatMoney(item.owedFils, theme.locale),
                })}
              </Text>
            )}
          </View>
        }
      />
    ),
    [openProfile, t, theme.locale, theme.spacing.xs],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          gap: theme.spacing.sm,
        }}
      >
        <Input
          label={t('admin.players.searchLabel')}
          value={filters.query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          testID="player-search"
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Button
            label={t('admin.players.filters')}
            onPress={toggleFilterPanel}
            variant={hasFilters ? 'primary' : 'ghost'}
            testID="player-filters-toggle"
          />
          {directory.data === undefined ? null : (
            <Text variant="caption" tone="tertiary" style={{ flex: 1 }} testID="player-count">
              {t('admin.players.count', { count: players.length })}
            </Text>
          )}
        </View>

        {isShowingFilters ? (
          <View style={{ gap: theme.spacing.sm }} testID="player-filters">
            <Text variant="caption" tone="tertiary">
              {t('admin.players.sortBy')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
              {SORTS.map((option) => (
                <ToggleChip
                  key={option.value}
                  label={t(option.labelKey)}
                  isOn={filters.sort === option.value}
                  onPress={() => setSort(option.value)}
                  testID={`sort-${option.value}`}
                />
              ))}
            </View>

            <Text variant="caption" tone="tertiary">
              {t('admin.players.filterTier')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
              {/* D58's nine, strongest first, which is how the coach says them. */}
              {[...TIERS].reverse().map((tier) => (
                <ToggleChip
                  key={tier}
                  label={tier}
                  isOn={filters.tier === tier}
                  onPress={() => toggleTier(tier)}
                  testID={`filter-tier-${tier}`}
                />
              ))}
            </View>

            <Text variant="caption" tone="tertiary">
              {t('admin.players.filterVisibility')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
              {(['level_0', 'level_1', 'level_2'] as const).map((level) => (
                <ToggleChip
                  key={level}
                  label={t(VISIBILITY_LABELS[level])}
                  isOn={filters.visibility === level}
                  onPress={() => toggleVisibility(level)}
                  testID={`filter-visibility-${level}`}
                />
              ))}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
              <ToggleChip
                label={t('admin.players.filterHasSubscription')}
                isOn={filters.hasSubscription === true}
                onPress={toggleHasSubscription}
                testID="filter-has-subscription"
              />
              <ToggleChip
                label={t('admin.players.filterOwesMoney')}
                isOn={filters.owesMoney === true}
                onPress={toggleOwesMoney}
                testID="filter-owes-money"
              />
            </View>

            {hasFilters ? (
              <Button
                label={t('admin.players.clearFilters')}
                onPress={clearFilters}
                variant="ghost"
                testID="player-clear-filters"
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {directory.isPending ? (
        <View
          testID="player-list-loading"
          style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
        >
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : directory.isError ? (
        <View style={{ padding: theme.spacing.lg }}>
          <ErrorState
            message={t(subscriptionErrorMessageKey(directory.error))}
            onRetry={refetch}
            isRetrying={directory.isFetching}
            testID="player-list-error"
          />
        </View>
      ) : players.length === 0 ? (
        <EmptyState
          message={t(
            hasFilters || filters.query.trim() !== ''
              ? 'admin.players.empty'
              : 'admin.players.emptyAll',
          )}
          testID="player-list-empty"
        />
      ) : (
        <FlashList
          testID="player-list"
          data={players}
          keyExtractor={(player) => player.id}
          renderItem={renderItem}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            directory.isFetchingNextPage ? (
              <View testID="player-list-loading-more" style={{ paddingVertical: theme.spacing.md }}>
                <Skeleton height={56} radius="md" />
              </View>
            ) : null
          }
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.xl,
          }}
          refreshControl={
            <RefreshControl
              // Loading the next page must not spin the pull-to-refresh
              // control; only a refetch of the whole list does.
              refreshing={directory.isFetching && !directory.isFetchingNextPage}
              onRefresh={refetch}
              tintColor={theme.colors.accent}
            />
          }
        />
      )}
    </View>
  );
};

export default PlayerListScreen;
