/**
 * What the session cost, and how the coach corrects it. BUILD-SPEC 12.1 as
 * amended by migration 0043, shown inside 15.2's Money tab.
 *
 * The footer above it prints one number — cost — and until now that number was
 * the rate tables' arithmetic and nothing else, with no way to say that this
 * particular night was not like the rate table. This card is that way.
 *
 * ── Two shapes, because there are two kinds of cost ───────
 * Court rent, coach fees and water are *rated*: 12.1 computes a figure for
 * every session automatically, and the coach's job is only ever to disagree
 * with one. So they are three lines showing what stands, each carrying its
 * default underneath when it has been overridden — "31.250 JD, rate says
 * 23.750" — and one *Edit* opening all three together.
 *
 * Overtime, snacks and shuttlecocks have no rate to disagree with. They are a
 * list: added one at a time, each with its own amount, each removable.
 *
 * ── Blank means default ──────────────────────────────────
 * In the edit sheet an empty field is not zero, it is "use the rate". Zero is
 * a real and common answer for water — the coach does not always bring any —
 * so the two cannot be conflated, and the placeholder shows the rate the field
 * would fall back to. The read-only line and the sheet's per-field hint both
 * say which of the two is in force.
 *
 * ── The lock ─────────────────────────────────────────────
 * `canEdit` is 10.2's gate, the same boolean every control on the Money tab
 * follows. After seven days the card renders as a record, with no Edit and no
 * remove. The server refuses either way (`assert_session_unlocked`).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  Icon,
  Input,
  NumericInput,
  SegmentedControl,
  Sheet,
  SkeletonCard,
  Text,
  normaliseAmount,
} from '@/components/primitives';
import { ErrorState } from '@/components/states';
import {
  useAddSessionExtraCost,
  useDeleteSessionExtraCost,
  useSessionCosts,
  useSetSessionCosts,
} from '@/features/sessions/costQueries';
import { EXTRA_COST_KINDS, type ExtraCostKind, type SessionCosts } from '@/features/sessions/costTypes';
import { sessionErrorMessageKey } from '@/features/sessions/errors';
import { fils, formatMoney, toJD, type Fils } from '@/lib/money';
import { useTheme } from '@/theme';

/** `session_extra_costs.label`'s own CHECK. */
const MAX_LABEL_LENGTH = 120;

const KIND_LABEL_KEYS: Record<ExtraCostKind, string> = {
  overtime: 'admin.costs.kindOvertime',
  snacks: 'admin.costs.kindSnacks',
  shuttlecocks: 'admin.costs.kindShuttlecocks',
  other: 'admin.costs.kindOther',
};

export interface SessionCostsCardProps {
  sessionId: string;
  /** 10.2's gate. False once the session locks; every control follows it. */
  canEdit: boolean;
}

/**
 * An amount as the money field holds it: dinars, as a string, so that a
 * half-typed "6." survives until the coach finishes. 5.3. Empty means "no
 * override", which is why this cannot just be a number.
 */
function toField(override: Fils | null): string {
  return override === null ? '' : String(toJD(override));
}

/** The inverse. An empty field is the absence of an override, not zero. */
function toOverride(field: string): Fils | null {
  const trimmed = field.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? fils(value) : null;
}

interface CostLineProps {
  label: string;
  amount: Fils;
  /** Rendered only when an override is in force, so the rate is still legible. */
  defaultAmount: Fils | null;
  testID: string;
}

const CostLine: React.FC<CostLineProps> = ({ label, amount, defaultAmount, testID }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="small" tone="secondary">
          {label}
        </Text>
        {defaultAmount === null ? null : (
          <Text variant="caption" tone="tertiary" testID={`${testID}-default`}>
            {t('admin.costs.rateWas', { amount: formatMoney(defaultAmount, theme.locale) })}
          </Text>
        )}
      </View>
      <Text variant="small" weight="600" testID={testID}>
        {formatMoney(amount, theme.locale)}
      </Text>
    </View>
  );
};

export const SessionCostsCard: React.FC<SessionCostsCardProps> = ({ sessionId, canEdit }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const costs = useSessionCosts(sessionId);
  const [isEditing, setIsEditing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const retry = useCallback((): void => {
    void costs.refetch();
  }, [costs]);

  const openEdit = useCallback((): void => setIsEditing(true), []);
  const closeEdit = useCallback((): void => setIsEditing(false), []);
  const openAdd = useCallback((): void => setIsAdding(true), []);
  const closeAdd = useCallback((): void => setIsAdding(false), []);

  if (costs.isPending) return <SkeletonCard testID="costs-loading" />;

  if (costs.isError || costs.data === undefined) {
    return (
      <ErrorState
        message={t(sessionErrorMessageKey(costs.error))}
        onRetry={retry}
        isRetrying={costs.isFetching}
        testID="costs-error"
      />
    );
  }

  const data = costs.data;

  return (
    <Card testID="session-costs">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Text variant="heading" style={{ flex: 1 }}>
          {t('admin.costs.title')}
        </Text>
        {canEdit ? (
          <Button
            label={t('common.edit')}
            onPress={openEdit}
            variant="ghost"
            testID="costs-edit"
          />
        ) : null}
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <CostLine
          label={t('admin.costs.court')}
          amount={data.courtCostFils}
          defaultAmount={data.courtCostOverrideFils === null ? null : data.courtCostDefaultFils}
          testID="costs-court"
        />
        <CostLine
          label={t('admin.costs.coachFee')}
          amount={data.coachFeeFils}
          defaultAmount={data.coachFeeOverrideFils === null ? null : data.coachFeeDefaultFils}
          testID="costs-coach-fee"
        />
        <CostLine
          label={t('admin.costs.water')}
          amount={data.waterCostFils}
          defaultAmount={data.waterCostOverrideFils === null ? null : data.waterCostDefaultFils}
          testID="costs-water"
        />
      </View>

      <View
        style={{
          gap: theme.spacing.sm,
          paddingTop: theme.spacing.sm,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="small" tone="secondary" style={{ flex: 1 }}>
            {t('admin.costs.extras')}
          </Text>
          {canEdit ? (
            <Button
              label={t('common.add')}
              onPress={openAdd}
              variant="ghost"
              icon="add"
              testID="costs-add-extra"
            />
          ) : null}
        </View>

        {data.extras.length === 0 ? (
          <Text variant="caption" tone="tertiary" testID="costs-extras-empty">
            {t('admin.costs.extrasEmpty')}
          </Text>
        ) : (
          data.extras.map((extra) => (
            <ExtraCostRow
              key={extra.id}
              sessionId={sessionId}
              id={extra.id}
              kindLabel={t(KIND_LABEL_KEYS[extra.kind])}
              note={extra.label}
              amountFils={extra.amountFils}
              canEdit={canEdit}
            />
          ))
        )}
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: theme.spacing.sm,
          paddingTop: theme.spacing.sm,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        <Text variant="small" weight="600" style={{ flex: 1 }}>
          {t('admin.costs.total')}
        </Text>
        <Text variant="small" weight="600" testID="costs-total">
          {formatMoney(data.costFils, theme.locale)}
        </Text>
      </View>

      {isEditing ? <EditCostsSheet costs={data} onClose={closeEdit} /> : null}
      {isAdding ? <AddExtraCostSheet sessionId={sessionId} onClose={closeAdd} /> : null}
    </Card>
  );
};

interface ExtraCostRowProps {
  sessionId: string;
  id: string;
  kindLabel: string;
  note: string | null;
  amountFils: Fils;
  canEdit: boolean;
}

const ExtraCostRow: React.FC<ExtraCostRowProps> = ({
  sessionId,
  id,
  kindLabel,
  note,
  amountFils,
  canEdit,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const remove = useDeleteSessionExtraCost();

  const onRemove = useCallback((): void => {
    remove.mutate({ id, sessionId });
  }, [id, remove, sessionId]);

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
      testID={`costs-extra-${id}`}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="small">{kindLabel}</Text>
        {note === null ? null : (
          <Text variant="caption" tone="tertiary">
            {note}
          </Text>
        )}
      </View>
      <Text variant="small" weight="600">
        {formatMoney(amountFils, theme.locale)}
      </Text>
      {canEdit ? (
        // A single line, one tap to remove and nothing to confirm: it is an
        // amount the coach typed a moment ago and can type again. Everything
        // destructive on this screen that cannot be retyped asks first.
        <Pressable
          onPress={onRemove}
          disabled={remove.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('common.remove')}
          hitSlop={theme.spacing.sm}
          style={{
            minHeight: theme.minTouchTarget,
            justifyContent: 'center',
            opacity: remove.isPending ? 0.45 : 1,
          }}
          testID={`costs-extra-${id}-remove`}
        >
          <Icon name="close" size={18} color={theme.colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
};

interface EditCostsSheetProps {
  costs: SessionCosts;
  onClose: () => void;
}

const EditCostsSheet: React.FC<EditCostsSheetProps> = ({ costs, onClose }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const save = useSetSessionCosts();

  const [court, setCourt] = useState(() => toField(costs.courtCostOverrideFils));
  const [coachFee, setCoachFee] = useState(() => toField(costs.coachFeeOverrideFils));
  const [water, setWater] = useState(() => toField(costs.waterCostOverrideFils));

  const onSave = useCallback((): void => {
    save.mutate(
      {
        sessionId: costs.sessionId,
        courtCostFils: toOverride(court),
        coachFeeFils: toOverride(coachFee),
        waterCostFils: toOverride(water),
      },
      { onSuccess: onClose },
    );
  }, [coachFee, costs.sessionId, court, onClose, save, water]);

  const clearAll = useCallback((): void => {
    setCourt('');
    setCoachFee('');
    setWater('');
  }, []);

  /** The rate this field falls back to when it is left empty. */
  const hintFor = useCallback(
    (fallback: Fils): string =>
      t('admin.costs.defaultHint', { amount: formatMoney(fallback, theme.locale) }),
    [t, theme.locale],
  );

  return (
    <Sheet
      isVisible
      title={t('admin.costs.editTitle')}
      onClose={onClose}
      isDismissDisabled={save.isPending}
      testID="costs-sheet"
    >
      <Text variant="small" tone="secondary">
        {t('admin.costs.editExplain')}
      </Text>

      <NumericInput
        label={t('admin.costs.court')}
        value={court}
        onChangeText={setCourt}
        suffix={t('common.jd')}
        hint={hintFor(costs.courtCostDefaultFils)}
        placeholder={String(toJD(costs.courtCostDefaultFils))}
        testID="costs-field-court"
      />
      <NumericInput
        label={t('admin.costs.coachFee')}
        value={coachFee}
        onChangeText={setCoachFee}
        suffix={t('common.jd')}
        hint={hintFor(costs.coachFeeDefaultFils)}
        placeholder={String(toJD(costs.coachFeeDefaultFils))}
        testID="costs-field-coach-fee"
      />
      <NumericInput
        label={t('admin.costs.water')}
        value={water}
        onChangeText={setWater}
        suffix={t('common.jd')}
        hint={hintFor(costs.waterCostDefaultFils)}
        placeholder={String(toJD(costs.waterCostDefaultFils))}
        testID="costs-field-water"
      />

      {save.isError ? (
        <Text variant="small" tone="danger" testID="costs-sheet-error">
          {t(sessionErrorMessageKey(save.error))}
        </Text>
      ) : null}

      <Button
        label={t('common.save')}
        onPress={onSave}
        isLoading={save.isPending}
        isFullWidth
        testID="costs-save"
      />
      <Button
        label={t('admin.costs.useDefaults')}
        onPress={clearAll}
        variant="ghost"
        isFullWidth
        testID="costs-use-defaults"
      />
    </Sheet>
  );
};

interface AddExtraCostSheetProps {
  sessionId: string;
  onClose: () => void;
}

const AddExtraCostSheet: React.FC<AddExtraCostSheetProps> = ({ sessionId, onClose }) => {
  const { t } = useTranslation();
  const add = useAddSessionExtraCost();

  const [kind, setKind] = useState<ExtraCostKind>('overtime');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const options = useMemo(
    () => EXTRA_COST_KINDS.map((value) => ({ value, label: t(KIND_LABEL_KEYS[value]) })),
    [t],
  );

  // An extra line with no amount is not a cost. Zero is refused here rather
  // than accepted and then ignored: unlike water, there is no reason to record
  // that snacks cost nothing — the absence of the line already says that.
  const amountFils = amount.trim() === '' ? null : fils(Number(amount));
  const canSubmit = amountFils !== null && amountFils > 0;

  const onNoteChange = useCallback(
    (value: string): void => setNote(value.slice(0, MAX_LABEL_LENGTH)),
    [],
  );

  const onAmountChange = useCallback(
    (value: string): void => setAmount(normaliseAmount(value, false)),
    [],
  );

  const onAdd = useCallback((): void => {
    if (amountFils === null) return;
    add.mutate(
      {
        sessionId,
        kind,
        amountFils,
        label: note.trim() === '' ? null : note.trim(),
      },
      { onSuccess: onClose },
    );
  }, [add, amountFils, kind, note, onClose, sessionId]);

  return (
    <Sheet
      isVisible
      title={t('admin.costs.addTitle')}
      onClose={onClose}
      isDismissDisabled={add.isPending}
      testID="costs-add-sheet"
    >
      <SegmentedControl<ExtraCostKind>
        label={t('admin.costs.kind')}
        options={options}
        value={kind}
        onChange={setKind}
        testID="costs-extra-kind"
      />

      <NumericInput
        label={t('admin.costs.amount')}
        value={amount}
        onChangeText={onAmountChange}
        suffix={t('common.jd')}
        testID="costs-extra-amount"
      />

      <Input
        label={t('admin.costs.note')}
        value={note}
        onChangeText={onNoteChange}
        hint={t('common.optional')}
        maxLength={MAX_LABEL_LENGTH}
        testID="costs-extra-note"
      />

      {add.isError ? (
        <Text variant="small" tone="danger" testID="costs-add-error">
          {t(sessionErrorMessageKey(add.error))}
        </Text>
      ) : null}

      <Button
        label={t('common.add')}
        onPress={onAdd}
        isDisabled={!canSubmit}
        isLoading={add.isPending}
        isFullWidth
        testID="costs-add-submit"
      />
    </Sheet>
  );
};

export default SessionCostsCard;
