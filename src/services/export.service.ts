/**
 * Hand a file to the phone's share sheet (email, Drive, Files, ...).
 */
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

async function share(file: File, mimeType: string, UTI: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, { mimeType, UTI, dialogTitle });
}

/**
 * Print HTML to a US Letter PDF and open the share sheet for it. expo-print
 * names the file at random, so it is moved to `fileName` first: that is the
 * name the email attachment or saved file gets.
 */
export async function sharePdf(fileName: string, html: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
  const printed = new File(uri);
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  printed.move(file);
  await share(file, 'application/pdf', 'com.adobe.pdf', 'Export timesheet');
}
