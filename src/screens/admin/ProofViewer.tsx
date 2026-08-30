/**
 * 10.2's *View proof*: "CliQ rows only. Opens the screenshot full screen,
 * pinch to zoom."
 *
 * ── The image ─────────────────────────────────────────────
 * The bucket is private and only staff may read it (7.3), so the image cannot
 * be a plain URL. `useProofUrl` signs one for five minutes, which is why the
 * query is only enabled while this is open.
 *
 * ── Zoom ──────────────────────────────────────────────────
 * A pinch gesture scales the image directly, the same
 * `Gesture`/`useSharedValue`/`useAnimatedStyle` shape `CourtTile.tsx` uses for
 * its pan, clamped to 1x–4x so pinching past either end does nothing rather
 * than shrinking the image out of the frame or blowing it up past legibility.
 * The tap-to-fill toggle is unchanged, for a one-tap look at the reference
 * without pinching at all.
 *
 * `ZoomableProofImage` is its own component, keyed by `storagePath` below,
 * rather than holding `scale`/`savedScale` in `ProofViewer` itself: the modal
 * does not unmount between screenshots, and a shared value cannot be reset
 * from a `useEffect` without the lint that guards their mutability tripping —
 * mounting a fresh instance per screenshot gives fresh scale state for free.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Button, Text } from '@/components/primitives';
import { ErrorState } from '@/components/states';
import { paymentErrorMessageKey } from '@/features/payments/errors';
import { useProofUrl } from '@/features/payments/queries';
import { useTheme } from '@/theme';

const MIN_SCALE = 1;
const MAX_SCALE = 4;

export interface ProofViewerProps {
  storagePath: string | null;
  /** The row's name, so the coach knows whose screenshot he is looking at. */
  title: string;
  onClose: () => void;
}

interface ZoomableProofImageProps {
  uri: string;
  isFilling: boolean;
  onToggleFill: () => void;
  zoomHint: string;
  altLabel: string;
}

const ZoomableProofImage: React.FC<ZoomableProofImageProps> = ({
  uri,
  isFilling,
  onToggleFill,
  zoomHint,
  altLabel,
}) => {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onUpdate((event) => {
          const next = savedScale.value * event.scale;
          scale.value = next < MIN_SCALE ? MIN_SCALE : next > MAX_SCALE ? MAX_SCALE : next;
        })
        .onEnd(() => {
          savedScale.value = scale.value;
        }),
    // Both shared values are stable for the life of this component and are
    // deliberately not dependencies, the same reasoning CourtTile's pan
    // gesture gives: listing them tells the compiler this memo may modify a
    // value another hook was handed, which is exactly what a shared value is
    // for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={pinchGesture}>
      <Animated.View style={[{ flex: 1 }, animatedImageStyle]}>
        <Pressable
          onPress={onToggleFill}
          accessibilityRole="imagebutton"
          accessibilityLabel={zoomHint}
          style={{ flex: 1 }}
        >
          <Image
            source={{ uri }}
            resizeMode={isFilling ? 'cover' : 'contain'}
            style={{ flex: 1, width: '100%' }}
            accessibilityLabel={altLabel}
            testID="proof-image"
          />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
};

export const ProofViewer: React.FC<ProofViewerProps> = ({ storagePath, title, onClose }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const insets = useSafeAreaInsets();
  const isOpen = storagePath !== null;
  const proof = useProofUrl(storagePath, isOpen);
  const [isFilling, setIsFilling] = useState(false);

  const toggleFill = useCallback((): void => setIsFilling((current) => !current), []);
  const retry = useCallback((): void => {
    void proof.refetch();
  }, [proof]);

  return (
    <Modal visible={isOpen} animationType="fade" onRequestClose={onClose} transparent={false}>
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="proof-viewer">
        {/* A full-screen `Modal` has no navigation header and no safe area of
            its own, so *Close* landed under the notch and was barely tappable.
            The insets are applied here rather than with `SafeAreaView` because
            the image below deliberately runs to all four edges. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            paddingTop: insets.top + theme.spacing.sm,
          }}
        >
          <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
            {title}
          </Text>
          <Button
            label={t('common.close')}
            onPress={onClose}
            variant="ghost"
            testID="proof-close"
          />
        </View>

        {proof.isPending ? (
          <View style={{ flex: 1, justifyContent: 'center' }} testID="proof-loading">
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : proof.isError || proof.data === undefined ? (
          <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.lg }}>
            <ErrorState
              message={t(paymentErrorMessageKey(proof.error))}
              onRetry={retry}
              isRetrying={proof.isFetching}
              testID="proof-error"
            />
          </View>
        ) : (
          <ZoomableProofImage
            key={storagePath ?? ''}
            uri={proof.data}
            isFilling={isFilling}
            onToggleFill={toggleFill}
            zoomHint={t('admin.money.proofZoomHint')}
            altLabel={t('admin.money.proofAlt', { name: title })}
          />
        )}

        <Text
          variant="caption"
          tone="tertiary"
          align="center"
          style={{
            padding: theme.spacing.md,
            paddingBottom: Math.max(insets.bottom, theme.spacing.md),
          }}
        >
          {t('admin.money.proofZoomHint')}
        </Text>
      </View>
    </Modal>
  );
};

export default ProofViewer;
