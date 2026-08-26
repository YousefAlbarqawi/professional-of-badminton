/**
 * The CliQ sub-flow inside the booking sheet. BUILD-SPEC 14.8 and 10.1.
 *
 * 14.8: "shows the CliQ alias with a copy button and the amount, then Attach
 * screenshot, then a thumbnail with a Replace option, then Confirm
 * reservation. The confirm button is disabled until an image is attached."
 *
 * ── The order of operations ───────────────────────────────
 * The player transfers the money in his own banking app, comes back, and
 * attaches what his bank showed him. Nothing here moves money and nothing here
 * checks that any money moved: D35 rules out a gateway and D36 rules out
 * reading the screenshot. The image is a record for the coach's review screen
 * (10.2), and D34 makes attaching one enough to confirm the spot on the spot.
 *
 * ── The alias ─────────────────────────────────────────────
 * Section 24 question 2 is still open, so `hasCliqAlias` is false until the
 * client says what the academy's alias is. While it is false the alias is not
 * shown at all and the player is sent to WhatsApp for it, because a
 * placeholder alias on a real phone would send somebody's money to nobody.
 * Everything else in the flow works.
 */
import React, { useCallback, useState } from 'react';
import { Image, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';

import { Button, Card, Text, WhatsAppButton } from '@/components/primitives';
import { pickAndPrepareProof } from '@/features/payments/cliqUpload';
import { paymentErrorMessageKey } from '@/features/payments/errors';
import type { PreparedProof } from '@/features/payments/types';
import { config, hasCliqAlias } from '@/lib/config';
import { formatMoney, type Fils } from '@/lib/money';
import { useTheme } from '@/theme';

export interface CliqPaymentStepProps {
  payableFils: Fils;
  proof: PreparedProof | null;
  onProofChange: (proof: PreparedProof | null) => void;
}

const THUMBNAIL = 96;

export const CliqPaymentStep: React.FC<CliqPaymentStepProps> = ({
  payableFils,
  proof,
  onProofChange,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const [isPicking, setIsPicking] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  const copyAlias = useCallback((): void => {
    void Clipboard.setStringAsync(config.cliqAlias).then(() => setHasCopied(true));
  }, []);

  const attach = useCallback((): void => {
    setIsPicking(true);
    setErrorKey(null);

    // 10.1 step 3 then step 4: picked, then resized to 1600px and compressed
    // to JPEG 0.7 before it leaves the phone.
    pickAndPrepareProof('library')
      .then((prepared) => {
        // Null is a cancelled picker, which is not a failure and must not look
        // like one.
        if (prepared !== null) onProofChange(prepared);
      })
      .catch((error: unknown) => setErrorKey(paymentErrorMessageKey(error)))
      .finally(() => setIsPicking(false));
  }, [onProofChange]);

  return (
    <View style={{ gap: theme.spacing.md }} testID="cliq-step">
      <Card testID="cliq-alias-card">
        <Text variant="small" tone="secondary">
          {t('payment.cliqTransferTo')}
        </Text>

        {hasCliqAlias ? (
          <>
            <Text variant="title" testID="cliq-alias">
              {config.cliqAlias}
            </Text>
            <View style={{ paddingTop: theme.spacing.sm }}>
              <Button
                label={hasCopied ? t('payment.aliasCopied') : t('payment.copyAlias')}
                onPress={copyAlias}
                variant="secondary"
                testID="cliq-copy"
              />
            </View>
          </>
        ) : (
          // Nothing invented. The player gets the alias from the coach, and the
          // rest of the flow still works.
          <View style={{ gap: theme.spacing.sm }} testID="cliq-alias-missing">
            <Text variant="small" tone="warning">
              {t('payment.aliasUnavailable')}
            </Text>
            <WhatsAppButton isFullWidth />
          </View>
        )}

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: theme.spacing.md,
          }}
        >
          <Text variant="small" tone="tertiary">
            {t('payment.amount')}
          </Text>
          <Text variant="heading" testID="cliq-amount">
            {formatMoney(payableFils, theme.locale)}
          </Text>
        </View>
      </Card>

      {proof === null ? (
        <Button
          label={t('payment.attachScreenshot')}
          onPress={attach}
          isLoading={isPicking}
          isFullWidth
          testID="cliq-attach"
        />
      ) : (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
          testID="cliq-thumbnail-row"
        >
          <Image
            source={{ uri: proof.uri }}
            accessibilityLabel={t('payment.screenshotAlt')}
            style={{
              width: THUMBNAIL,
              height: THUMBNAIL,
              borderRadius: theme.radii.sm,
              backgroundColor: theme.colors.bgSurface,
            }}
            resizeMode="cover"
            testID="cliq-thumbnail"
          />
          <View style={{ flex: 1, gap: theme.spacing.xs }}>
            <Text variant="small" tone="secondary">
              {t('payment.screenshotAttached')}
            </Text>
            <Button
              label={t('payment.replaceScreenshot')}
              onPress={attach}
              variant="secondary"
              isLoading={isPicking}
              testID="cliq-replace"
            />
          </View>
        </View>
      )}

      {errorKey === null ? null : (
        <Text variant="small" tone="danger" testID="cliq-pick-error">
          {t(errorKey)}
        </Text>
      )}

      <Text variant="caption" tone="tertiary">
        {t('payment.cliqNoApproval')}
      </Text>
    </View>
  );
};

export default CliqPaymentStep;
