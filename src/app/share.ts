export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Opens the system share sheet with files, or falls back to downloading them. */
export async function shareFiles(files: File[]): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (files.length > 0 && typeof nav.share === 'function' && nav.canShare?.({ files })) {
    try {
      await nav.share({ files });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Fall through to download.
    }
  }
  for (const f of files) downloadBlob(f, f.name);
  return 'downloaded';
}
