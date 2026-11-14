import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  SELECTED_CLASS_ID: '@ilmtrack/selectedClassId',
  SELECTED_ORG_ID: '@ilmtrack/selectedOrgId',
} as const;

export async function getSelectedOrgId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.SELECTED_ORG_ID);
  } catch (error) {
    console.error('Error getting selected organization ID:', error);
    return null;
  }
}

export async function setSelectedOrgId(orgId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.SELECTED_ORG_ID, orgId);
  } catch (error) {
    console.error('Error setting selected organization ID:', error);
  }
}

export async function getSelectedClassId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.SELECTED_CLASS_ID);
  } catch (error) {
    console.error('Error getting selected class ID:', error);
    return null;
  }
}

export async function setSelectedClassId(classId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.SELECTED_CLASS_ID, classId);
  } catch (error) {
    console.error('Error setting selected class ID:', error);
  }
}

export async function clearSelectedClassId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.SELECTED_CLASS_ID);
  } catch (error) {
    console.error('Error clearing selected class ID:', error);
  }
}

/**
 * Feature help sheets (components/common/HelpSheet) shown on this device, so
 * each opens by itself only the first time. Per device, not per account: a
 * convenience, and losing it just shows the help again.
 */
export type HelpFeature = 'timekeeping';
const helpKey = (feature: HelpFeature) => `@ilmtrack/helpSeen/${feature}`;

export async function hasSeenHelp(feature: HelpFeature): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(helpKey(feature))) !== null;
  } catch (error) {
    console.error('Error reading help seen:', error);
    // Unreadable: don't open it by itself; the help link still works.
    return true;
  }
}

export async function markHelpSeen(feature: HelpFeature): Promise<void> {
  try {
    await AsyncStorage.setItem(helpKey(feature), '1');
  } catch (error) {
    console.error('Error saving help seen:', error);
  }
}
