import type { Params } from '../lenses/types';

export interface GeoTag {
  lat: number;
  lon: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  at: string;
}

export interface FieldLogData {
  palette: { hex: string; weight: number }[];
  warmIndex: number;
  version: number;
}

export type CaptureSource = 'camera' | 'import' | 'derived';
export type CaptureMethod = 'imagecapture' | 'video-frame' | 'file' | 'test-pattern' | 'burst' | 'slit-scan';

export interface Capture {
  /** Sortable by time (ULID-style). */
  id: string;
  createdAt: string;
  source: CaptureSource;
  parentId?: string;
  originalKey?: string;
  outputKey: string;
  thumbKey: string;
  outputType: string;
  lensId: string;
  lensVersion: number;
  params: Params;
  seed: number;
  width: number;
  height: number;
  captureMethod?: CaptureMethod;
  geo?: GeoTag;
  fieldlog?: FieldLogData;
  /** When this capture's files were written to the phone album folder. */
  albumSavedAt?: string;
  appVersion: string;
}
