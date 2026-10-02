export interface ChangelogEntry {
  version: string;
  notes: string[];
}

/**
 * Returns the newest entry of a Keep-a-Changelog style file:
 * the first "## " heading and the bullet lines under it.
 */
export function latestChangelogEntry(markdown: string): ChangelogEntry | null {
  const lines = markdown.split(/\r?\n/);
  let version: string | null = null;
  const notes: string[] = [];
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (version !== null) break;
      const m = /v?(\d+\.\d+\.\d+[\w.-]*)/.exec(line);
      version = m?.[1] ?? line.slice(3).trim();
      continue;
    }
    if (version !== null) {
      const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
      if (bullet?.[1]) notes.push(bullet[1].trim());
    }
  }
  return version === null ? null : { version, notes };
}
