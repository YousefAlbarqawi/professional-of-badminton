/**
 * Never-pair and always-pair rules. D65: "Full manual control: drag, swap,
 * lock a court, never-pair rules, always-pair rules."
 *
 * A rule is about two people, not about one night — the table in migration
 * 0007 keys it on profiles and 13.8 says it survives regeneration — so the
 * list here is every rule the coach has ever made, and the ones whose players
 * are both on tonight's roster are marked as active.
 *
 * A guest has no profile row (D44, D46), so he cannot carry a rule and does
 * not appear in the picker. The alternative would be a rule that evaporates
 * with the guest who is not remembered anyway.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Card, SegmentedControl, Sheet, Text } from '@/components/primitives';
import type { RosterEntry } from '@/features/bookings/types';
import type { PairingRuleSummary } from '@/features/matchmaking/boardTypes';
import { lineupErrorMessageKey } from '@/features/matchmaking/errors';
import { useDeletePairingRule, useSetPairingRule } from '@/features/matchmaking/mutations';
import type { PairingRuleKind } from '@/features/matchmaking/types';
import { useTheme } from '@/theme';

export interface PairingRulesSheetProps {
  isVisible: boolean;
  onClose: () => void;
  attendees: readonly RosterEntry[];
  rules: readonly PairingRuleSummary[];
}

export const PairingRulesSheet: React.FC<PairingRulesSheetProps> = ({
  isVisible,
  onClose,
  attendees,
  rules,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const [kind, setKind] = useState<PairingRuleKind>('never_pair');
  const [picked, setPicked] = useState<string[]>([]);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const setRule = useSetPairingRule();
  const removeRule = useDeletePairingRule();

  const candidates = useMemo(
    () =>
      attendees.filter(
        (entry): entry is RosterEntry & { playerId: string } => entry.playerId !== null,
      ),
    [attendees],
  );

  const attendingPlayerIds = useMemo(
    () => new Set(candidates.map((entry) => entry.playerId)),
    [candidates],
  );

  const kindOptions = useMemo(
    () => [
      { value: 'never_pair' as const, label: t('admin.board.neverPair') },
      { value: 'always_pair' as const, label: t('admin.board.alwaysPair') },
    ],
    [t],
  );

  const togglePicked = useCallback((playerId: string): void => {
    setErrorKey(null);
    setPicked((current) => {
      if (current.includes(playerId)) return current.filter((id) => id !== playerId);
      // Two at a time. A third replaces the older of the two, which is less
      // annoying than refusing the tap.
      return current.length < 2 ? [...current, playerId] : [current[1] ?? '', playerId];
    });
  }, []);

  const save = useCallback((): void => {
    const [playerAId, playerBId] = picked;
    if (playerAId === undefined || playerBId === undefined) return;
    setRule.mutate(
      { kind, playerAId, playerBId },
      {
        onSuccess: () => setPicked([]),
        onError: (error) => setErrorKey(lineupErrorMessageKey(error)),
      },
    );
  }, [kind, picked, setRule]);

  const remove = useCallback(
    (ruleId: string): void => {
      removeRule.mutate(ruleId, { onError: (error) => setErrorKey(lineupErrorMessageKey(error)) });
    },
    [removeRule],
  );

  return (
    <Sheet
      isVisible={isVisible}
      title={t('admin.board.pairingRules')}
      onClose={onClose}
      isDismissDisabled={setRule.isPending || removeRule.isPending}
      testID="pairing-rules-sheet"
    >
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="small" tone="secondary">
          {t('admin.board.pairingRulesHint')}
        </Text>

        <SegmentedControl
          label={t('admin.board.pairingRulesKind')}
          options={kindOptions}
          value={kind}
          onChange={setKind}
          testID="pairing-kind"
        />

        <Text variant="heading">{t('admin.board.pickTwo')}</Text>
        <ScrollView style={{ maxHeight: 220 }}>
          <View style={{ gap: theme.spacing.sm }}>
            {candidates.map((entry) => (
              <Button
                key={entry.playerId}
                label={entry.displayName}
                variant={picked.includes(entry.playerId) ? 'primary' : 'secondary'}
                onPress={() => togglePicked(entry.playerId)}
                testID={`pairing-candidate-${entry.playerId}`}
              />
            ))}
            {candidates.length === 0 ? (
              <Text variant="small" tone="secondary">
                {t('admin.board.noRegisteredPlayers')}
              </Text>
            ) : null}
          </View>
        </ScrollView>

        <Button
          label={t('admin.board.addRule')}
          onPress={save}
          isDisabled={picked.length !== 2}
          isLoading={setRule.isPending}
          testID="pairing-save"
        />

        {errorKey === null ? null : (
          <Text variant="small" tone="danger" testID="pairing-error">
            {t(errorKey)}
          </Text>
        )}

        <Text variant="heading">{t('admin.board.existingRules')}</Text>
        {rules.length === 0 ? (
          <Text variant="small" tone="secondary" testID="pairing-empty">
            {t('admin.board.noRules')}
          </Text>
        ) : (
          rules.map((rule) => {
            const isActive =
              attendingPlayerIds.has(rule.playerAId) && attendingPlayerIds.has(rule.playerBId);
            return (
              <Card key={rule.id} testID={`pairing-rule-${rule.id}`}>
                <Text variant="body">
                  {t(
                    rule.kind === 'never_pair'
                      ? 'admin.board.neverPairRow'
                      : 'admin.board.alwaysPairRow',
                    { a: rule.playerAName, b: rule.playerBName },
                  )}
                </Text>
                <Text variant="caption" tone={isActive ? 'accent' : 'tertiary'}>
                  {t(isActive ? 'admin.board.ruleActive' : 'admin.board.ruleInactive')}
                </Text>
                <View style={{ paddingTop: theme.spacing.sm }}>
                  <Button
                    label={t('admin.board.removeRule')}
                    variant="destructive"
                    onPress={() => remove(rule.id)}
                    testID={`pairing-remove-${rule.id}`}
                  />
                </View>
              </Card>
            );
          })
        )}
      </View>
    </Sheet>
  );
};

export default PairingRulesSheet;
