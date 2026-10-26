/**
 * Hand a file to the phone's share sheet (email, Drive, Files, ...).
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Write a CSV to the cache and open the share sheet for it. */
export async function shareCsv(fileName: string, csv: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  await file.write(csv);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Export timesheet',
  });
}
