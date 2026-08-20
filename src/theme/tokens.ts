/**
 * Design tokens. Verbatim from BUILD-SPEC section 17.1.
 *
 * Dark theme only. There is no light theme and no system theme following.
 * The academy's identity is black and mint.
 */

export const colors = {
  bg: '#111111',
  bgElevated: '#1C1C1C',
  bgSurface: '#2A2A2A',
  border: '#3A3A3A',
  accent: '#A8D5BA',
  accentPressed: '#8FC4A4',
  accentText: '#0B1F14',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textTertiary: '#7A7A7A',
  success: '#6FCF97',
  warning: '#E2B93B',
  danger: '#E06C5A',
  info: '#7FB3D5',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radii = { sm: 6, md: 12, lg: 20, pill: 999 } as const;

export const typography = {
  display: { size: 32, weight: '700', lineHeight: 40 },
  title: { size: 24, weight: '700', lineHeight: 32 },
  heading: { size: 18, weight: '600', lineHeight: 26 },
  body: { size: 16, weight: '400', lineHeight: 24 },
  small: { size: 14, weight: '400', lineHeight: 20 },
  caption: { size: 12, weight: '400', lineHeight: 16 },
  courtName: { size: 20, weight: '700', lineHeight: 26 },
} as const;

/**
 * Tier badge colours, by letter family. The label is always visible as text —
 * never colour alone, since a player may be told his tier by a coach who is
 * colour blind for all we know. BUILD-SPEC 17.2.
 */
export const tierBadgeColors = {
  A: { background: '#A8D5BA', text: '#0B1F14' },
  B: { background: '#7FB3D5', text: '#08202E' },
  C: { background: '#B0B0B0', text: '#1A1A1A' },
  unrated: { background: 'transparent', text: '#7A7A7A' },
} as const;

/** Minimum touch target, in points. BUILD-SPEC 17.4. */
export const MIN_TOUCH_TARGET = 44;

/**
 * The court board is read aloud at arm's length under gym lighting, so player
 * names never render below this. BUILD-SPEC 13.10.
 */
export const MIN_COURT_NAME_SIZE = 18;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type Radii = typeof radii;
export type Typography = typeof typography;
export type TypographyVariant = keyof Typography;
export type TierBadgeColors = typeof tierBadgeColors;
