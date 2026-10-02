import { formatVersion } from './util/format';
import type { ChangelogEntry } from './util/changelog';

declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string;
declare const __BUILD_DATE__: string;
declare const __WHATS_NEW__: ChangelogEntry | null;

export const APP_VERSION = __APP_VERSION__;
export const BUILD_SHA = __BUILD_SHA__;
export const BUILD_DATE = __BUILD_DATE__;
export const WHATS_NEW = __WHATS_NEW__;
export const VERSION_LABEL = formatVersion(APP_VERSION, BUILD_SHA);
