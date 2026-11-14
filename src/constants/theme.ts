import { MD3LightTheme, useTheme } from 'react-native-paper';
import brand from './brand.json';

/**
 * The app's colours, by what they mean rather than what they look like. Use
 * these everywhere: never a hex code in a screen or component. One shade per
 * meaning: success is always `success`, whether it's text, an icon or a bar.
 *
 * `brand.json` holds the brand blue on its own so app.config.js (the splash
 * screen and Android icon background) can read it too.
 *
 * Static, so StyleSheet.create can use it directly; useAppTheme() gives the
 * same values through react-native-paper's theme.
 */
export const colors = {
  /** Brand blue: headers, links, main buttons, selected things. */
  primary: brand.primary,
  /** Darker blue, for bold links on white. */
  primaryDark: '#1557b0',
  /** Light blue fill: selected chips, today, a pressed row, highlighted cards. */
  primarySoft: '#e8f0fe',
  /** Faintest blue, for large areas (the week grid's today column). */
  primaryFaint: '#f6f9fe',
  /** Text and icons on primary (the header, filled buttons). */
  onPrimary: '#ffffff',

  /** Main text. */
  text: '#333333',
  /** Secondary text: descriptions, hints, captions. */
  textSecondary: '#666666',
  /** Placeholder-weight text, and things that are off or empty. */
  textDisabled: '#999999',
  /** Disabled or empty icons and marks (unfilled stars, a past day's dot). */
  disabled: '#c4c4c4',

  /** Screen background. */
  background: '#ffffff',
  /** A grey panel on the background: section rows, read-only boxes. */
  surface: '#f5f5f5',
  /** Lines around inputs and cards. */
  border: '#e0e0e0',
  /** Hairlines between list rows. */
  divider: '#eeeeee',

  /** Done, present, worked. */
  success: '#2e7d32',
  successSoft: '#e8f5e9',
  /** Late, on break, needs attention. */
  warning: '#e65100',
  warningSoft: '#fff3e0',
  /** Errors, absent, delete. */
  danger: '#d32f2f',
  dangerSoft: '#ffebee',
  dangerBorder: '#ffcdd2',

  /** Filled homework stars. */
  star: '#ffc107',
  shadow: '#000000',
  /** The dimmed screen behind a pop-up. */
  scrim: 'rgba(0, 0, 0, 0.5)',
} as const;

type Status = 'present' | 'absent' | 'late' | 'excused' | 'assigned' | 'completed' | 'incomplete';

/**
 * Attendance and homework status, the same colour everywhere: present and
 * completed are success, absent and incomplete danger, late warning, excused
 * and assigned primary. `statusSoftColor` is the matching light fill.
 */
export function statusColor(status: Status | string | null | undefined): string {
  switch (status) {
    case 'present':
    case 'completed':
      return colors.success;
    case 'absent':
    case 'incomplete':
      return colors.danger;
    case 'late':
      return colors.warning;
    case 'excused':
    case 'assigned':
      return colors.primary;
    default:
      return colors.textSecondary;
  }
}

export function statusSoftColor(status: Status | string | null | undefined): string {
  switch (status) {
    case 'present':
    case 'completed':
      return colors.successSoft;
    case 'absent':
    case 'incomplete':
      return colors.dangerSoft;
    case 'late':
      return colors.warningSoft;
    case 'excused':
    case 'assigned':
      return colors.primarySoft;
    default:
      return colors.surface;
  }
}

/**
 * The type scale, by role: use `<Text variant={typography.h2}>`, never a
 * Paper variant name or a fontSize on a Text. Each maps to a Paper variant,
 * so changing the font (configureFonts) or a role's size happens here.
 */
export const typography = {
  /** The biggest number or word on a screen (a dashboard figure). */
  display: 'displaySmall',
  /** A screen's main title in its content (sign-in, empty states). */
  h1: 'headlineMedium',
  h2: 'headlineSmall',
  /** A section or card title. */
  h3: 'titleLarge',
  /** Section headings in a form, list row titles. */
  h4: 'titleMedium',
  h5: 'titleSmall',
  bodyLarge: 'bodyLarge',
  body: 'bodyMedium',
  /** Descriptions, hints, footnotes. */
  caption: 'bodySmall',
  /** Buttons, links, tabs. */
  label: 'labelLarge',
  labelMedium: 'labelMedium',
  labelSmall: 'labelSmall',
} as const;

/** For the few places that set a size outside a Paper Text (chips, inputs, hand-drawn controls). */
export const fontSize = {
  xs: 11,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Corner rounding. Circles use half their size instead. */
export const radius = {
  /** Tags, small marks. */
  sm: 4,
  /** Buttons, inputs, most cards (the app's default). */
  md: 8,
  /** Larger cards and panels. */
  lg: 12,
  /** Pill-shaped chips. */
  xl: 16,
} as const;

/** Spacing steps, for padding and gaps. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/** Every stack's header: brand blue with white text. Spread into screenOptions. */
export const headerOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.onPrimary,
  headerTitleStyle: { fontWeight: fontWeight.semibold },
} as const;

/**
 * The react-native-paper theme, built from the colours above so Paper's own
 * components (buttons, chips, switches, text fields) match.
 */
export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    secondary: colors.textSecondary,
    error: colors.danger,
    /**
     * The time clock's states: the Classes bar and the Time sheet. `bg` is
     * the bar's fill, `fg` its text and icon (and the sheet's status labels).
     */
    timeClock: {
      running: { bg: colors.successSoft, fg: colors.success },
      paused: { bg: colors.warningSoft, fg: colors.warning },
      ready: { bg: colors.primarySoft, fg: colors.primary },
      idle: { bg: colors.surface, fg: colors.textSecondary },
    },
  },
};

export type AppTheme = typeof theme;
export type TimeClockTone = keyof AppTheme['colors']['timeClock'];

export const useAppTheme = () => useTheme<AppTheme>();
