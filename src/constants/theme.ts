import { MD3LightTheme, useTheme } from 'react-native-paper';

/**
 * The app's react-native-paper theme. Custom colours are added alongside
 * Paper's own; read them with useAppTheme() so they are typed.
 */
export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1a73e8',
    secondary: '#5f6368',
    /**
     * The time clock's states: the Classes bar and the Time sheet. `bg` is
     * the bar's fill, `fg` its text and icon (and the sheet's status labels).
     */
    timeClock: {
      running: { bg: '#e6f4ea', fg: '#1e7e34' },
      paused: { bg: '#fff4e0', fg: '#b25e00' },
      ready: { bg: '#e8f0fe', fg: '#1a73e8' },
      idle: { bg: '#f1f3f4', fg: '#5f6368' },
    },
  },
};

export type AppTheme = typeof theme;
export type TimeClockTone = keyof AppTheme['colors']['timeClock'];

export const useAppTheme = () => useTheme<AppTheme>();
