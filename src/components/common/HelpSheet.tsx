import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './Button';
import { colors, fontWeight, spacing, typography } from '../../constants/theme';

export interface HelpItem {
  /** A MaterialCommunityIcons name. */
  icon: string;
  title: string;
  text: string;
}

interface HelpSheetProps {
  title: string;
  intro?: string;
  items: HelpItem[];
  onDone: () => void;
}

/**
 * What a feature is for, as a list of what you can do there. Shown in a
 * native bottom sheet (a route with presentation 'formSheet' and
 * sheetAllowedDetents 'fitToContents'): by itself on the first visit, then
 * from the feature's HelpLink. Kept short so it fits without scrolling (a
 * fit-to-contents sheet can't scroll). See "Feature help" in
 * app/(teacher)/CLAUDE.md.
 */
export function HelpSheet({ title, intro, items, onDone }: HelpSheetProps) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <Text variant={typography.h3} style={styles.title}>
        {title}
      </Text>
      {intro && (
        <Text variant={typography.body} style={styles.intro}>
          {intro}
        </Text>
      )}
      {items.map((item) => (
        <View key={item.title} style={styles.item}>
          <MaterialCommunityIcons
            name={item.icon as keyof typeof MaterialCommunityIcons.glyphMap}
            size={24}
            color={colors.primary}
            style={styles.icon}
          />
          <View style={styles.itemText}>
            <Text variant={typography.h5} style={styles.itemTitle}>
              {item.title}
            </Text>
            <Text variant={typography.body} style={styles.muted}>
              {item.text}
            </Text>
          </View>
        </View>
      ))}
      <Button onPress={onDone} style={styles.done}>
        Got it
      </Button>
    </SafeAreaView>
  );
}

interface HelpLinkProps {
  label: string;
  onPress: () => void;
}

/** The way back to a feature's HelpSheet after the first visit: bold blue text with an info icon. */
export function HelpLink({ label, onPress }: HelpLinkProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      accessibilityRole="button"
      hitSlop={8}
    >
      <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.primaryDark} />
      <Text variant={typography.label} style={styles.linkText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingTop: 28,
  },
  title: {
    fontWeight: fontWeight.semibold,
    marginBottom: 6,
  },
  intro: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  item: {
    flexDirection: 'row',
    paddingVertical: 10,
  },
  icon: {
    marginRight: spacing.lg,
    marginTop: 2,
  },
  itemText: {
    flex: 1,
  },
  itemTitle: {
    fontWeight: fontWeight.semibold,
    marginBottom: 2,
  },
  muted: {
    color: colors.textSecondary,
  },
  done: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  pressed: {
    opacity: 0.6,
  },
  linkText: {
    color: colors.primaryDark,
    fontWeight: fontWeight.bold,
  },
});
