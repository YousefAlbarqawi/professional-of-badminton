/**
 * The WhatsApp affordance. D72 requires it to be reachable from almost every
 * screen, including the empty and error states, which is why it lives with the
 * primitives rather than inside any one feature.
 */
import React, { useCallback } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { openWhatsApp } from '@/lib/whatsapp';
import { useTranslation } from 'react-i18next';

import { Button, type ButtonProps } from './Button';

export interface WhatsAppButtonProps {
  /** Prefills the message body, for example a session reference. */
  message?: string;
  variant?: ButtonProps['variant'];
  isFullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({
  message,
  variant = 'secondary',
  isFullWidth = false,
  style,
  testID = 'whatsapp-button',
}) => {
  const { t } = useTranslation();

  const handlePress = useCallback((): void => {
    void openWhatsApp(message);
  }, [message]);

  return (
    <Button
      label={t('common.whatsapp')}
      onPress={handlePress}
      variant={variant}
      isFullWidth={isFullWidth}
      icon="logo-whatsapp"
      style={style}
      testID={testID}
    />
  );
};

export default WhatsAppButton;
