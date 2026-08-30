/**
 * Icon. Thin wrapper over `@expo/vector-icons`' Ionicons — added to section 2.1
 * per the client's own instruction, the same way `expo-haptics` and
 * `@react-native-community/datetimepicker` were added in phase 10. Ionicons
 * ships inside every Expo project already (no extra native linking), covers
 * both the app's outline/filled icon needs and brand marks like WhatsApp, and
 * tints via `color` exactly like the `Text` primitive already does.
 */
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface IconProps {
  name: IconName;
  size?: number;
  color: string;
}

export const Icon: React.FC<IconProps> = ({ name, size = 20, color }) => (
  <Ionicons name={name} size={size} color={color} />
);

export default Icon;
