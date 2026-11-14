import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './Button';

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
      <Text variant="titleLarge" style={styles.title}>
        {title}
      </Text>
      {intro && (
        <Text variant="bodyMedium" style={styles.intro}>
          {intro}
        </Text>
      )}
      {items.map((item) => (
        <View key={item.title} style={styles.item}>
          <MaterialCommunityIcons
            name={item.icon as keyof typeof MaterialCommunityIcons.glyphMap}
            size={24}
            color="#1a73e8"
            style={styles.icon}
          />
          <View style={styles.itemText}>
            <Text variant="titleSmall" style={styles.itemTitle}>
              {item.title}
            </Text>
            <Text variant="bodyMedium" style={styles.muted}>
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
      <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#1557b0" />
      <Text variant="labelLarge" style={styles.linkText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  title: {
    fontWeight: '600',
    marginBottom: 6,
  },
  intro: {
    color: '#555',
    marginBottom: 12,
  },
  item: {
    flexDirection: 'row',
    paddingVertical: 10,
  },
  icon: {
    marginRight: 16,
    marginTop: 2,
  },
  itemText: {
    flex: 1,
  },
  itemTitle: {
    fontWeight: '600',
    marginBottom: 2,
  },
  muted: {
    color: '#555',
  },
  done: {
    marginTop: 16,
    marginBottom: 16,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pressed: {
    opacity: 0.6,
  },
  linkText: {
    color: '#1557b0',
    fontWeight: '700',
  },
});
