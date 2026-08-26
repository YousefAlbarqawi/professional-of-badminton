/**
 * Delete account. BUILD-SPEC 14.14, assumption A1, App Store guideline
 * 5.1.1(v).
 *
 * A screen that explains what happens, then a dialog that will not confirm
 * until the player types a word. Nothing is destroyed by a mistaken tap.
 *
 * The word is translated. Asking somebody on an Arabic keyboard to produce
 * "DELETE" in Latin letters is a barrier, not a safeguard; the point is
 * deliberate typing, and `حذف` demands exactly as much of it.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Card, Dialog, Input, Text, WhatsAppButton } from '@/components/primitives';
import { useDeleteAccount } from '@/features/auth/mutations';
import { useTheme } from '@/theme';
import type { ProfileStackParamList } from '@/app/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'DeleteAccount'>;

const CONSEQUENCE_KEYS = [
  'deleteAccount.pointBookings',
  'deleteAccount.pointCredits',
  'deleteAccount.pointIdentity',
  'deleteAccount.pointHistory',
  'deleteAccount.pointBalance',
] as const;

export const DeleteAccountScreen: React.FC<Props> = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const deleteAccount = useDeleteAccount();
  const [isConfirming, setIsConfirming] = useState(false);
  const [typedWord, setTypedWord] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requiredWord = t('deleteAccount.confirmWord');

  const isWordCorrect = useMemo(
    () => typedWord.trim().toLocaleUpperCase() === requiredWord.toLocaleUpperCase(),
    [requiredWord, typedWord],
  );

  const openConfirm = useCallback((): void => {
    setTypedWord('');
    setErrorMessage(null);
    setIsConfirming(true);
  }, []);

  const closeConfirm = useCallback((): void => setIsConfirming(false), []);

  const confirmDelete = useCallback((): void => {
    if (!isWordCorrect) return;
    setErrorMessage(null);

    deleteAccount.mutate(undefined, {
      // Nothing to navigate to. The account is gone, the session with it, and
      // AuthProvider drops the whole tree back to the auth stack.
      onError: () => {
        setIsConfirming(false);
        setErrorMessage(t('deleteAccount.failed'));
      },
    });
  }, [deleteAccount, isWordCorrect, t]);

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
      testID="delete-account-screen"
    >
      <Text variant="body" tone="secondary">
        {t('deleteAccount.intro')}
      </Text>

      <Card>
        <View style={{ gap: theme.spacing.sm }}>
          {CONSEQUENCE_KEYS.map((key) => (
            <View key={key} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Text variant="body" tone="tertiary">
                •
              </Text>
              <Text variant="body" style={{ flex: 1 }}>
                {t(key)}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {errorMessage === null ? null : (
        <Text variant="small" tone="danger" testID="delete-account-error">
          {errorMessage}
        </Text>
      )}

      <Button
        label={t('deleteAccount.action')}
        onPress={openConfirm}
        variant="destructive"
        isFullWidth
        testID="delete-account-start"
      />

      <WhatsAppButton isFullWidth variant="ghost" />

      <Dialog
        isVisible={isConfirming}
        title={t('deleteAccount.confirmTitle')}
        message={t('deleteAccount.confirmBody', { word: requiredWord })}
        confirmLabel={t('deleteAccount.confirmAction')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDelete}
        onCancel={closeConfirm}
        isConfirmDisabled={!isWordCorrect}
        isConfirming={deleteAccount.isPending}
        isDestructive
        testID="delete-account-dialog"
      >
        <Input
          label={t('deleteAccount.confirmField')}
          value={typedWord}
          onChangeText={setTypedWord}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={requiredWord}
          testID="delete-account-word"
        />
      </Dialog>
    </ScrollView>
  );
};

export default DeleteAccountScreen;
