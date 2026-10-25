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
