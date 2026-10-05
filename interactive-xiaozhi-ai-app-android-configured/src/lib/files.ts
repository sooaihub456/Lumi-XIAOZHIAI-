import { Clipboard } from '@capacitor/clipboard';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from './platform';
import { desktopBridge } from './desktop';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not prepare this file.'));
    reader.readAsDataURL(blob);
  });
}

export async function exportFile(name: string, blob: Blob): Promise<'downloaded' | 'shared'> {
  const desktop = desktopBridge();
  if (desktop) {
    const result = await desktop.saveFile(name, new Uint8Array(await blob.arrayBuffer()));
    if (!result.saved) throw new Error('Save canceled.');
    return 'downloaded';
  }
  if (isNative) {
    const path = `mori-exports/${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { uri } = await Filesystem.writeFile({ path, directory: Directory.Cache, data: await blobToBase64(blob), recursive: true });
    await Share.share({ title: name, dialogTitle: 'Save or share your little moment', files: [uri] });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return 'downloaded';
}

export async function copyText(text: string) {
  if (desktopBridge()) await desktopBridge()!.copyText(text);
  else if (isNative) await Clipboard.write({ string: text });
  else await navigator.clipboard.writeText(text);
}

export function isShareCancellation(error: unknown) {
  return error instanceof Error && /cancel|canceled|dismiss|not shared/i.test(error.message);
}