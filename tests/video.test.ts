import { describe, expect, it } from 'vitest';
import { baseType, clock, isVideoType, nextDuration, pickVideoType } from '../src/app/video';
import { albumFilenames, extFor } from '../src/storage/album';
import type { Capture } from '../src/storage/types';

describe('video helpers', () => {
  it('prefers MP4 and falls back to WebM', () => {
    expect(pickVideoType(() => true)).toMatch(/^video\/mp4/);
    expect(pickVideoType((t) => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp9');
    expect(pickVideoType(() => false)).toBeNull();
    expect(
      pickVideoType(() => {
        throw new Error('nope');
      }),
    ).toBeNull();
  });

  it('formats types, durations and clocks', () => {
    expect(baseType('video/mp4;codecs=avc1')).toBe('video/mp4');
    expect(nextDuration(5)).toBe(10);
    expect(nextDuration(15)).toBe(5);
    expect(nextDuration(7)).toBe(5);
    expect(clock(3.9)).toBe('0:03');
    expect(clock(75)).toBe('1:15');
    expect(isVideoType('video/webm')).toBe(true);
    expect(isVideoType('image/jpeg')).toBe(false);
  });

  it('names album video files with the right extension', () => {
    expect(extFor('video/mp4')).toBe('mp4');
    expect(extFor('video/webm')).toBe('webm');
    const c = { id: '01JABCDEFGHIJKLMNOPQRS', createdAt: '2026-10-04T19:00:00', lensId: 'ink-wash', outputType: 'video/mp4' } as Capture;
    expect(albumFilenames(c).output).toMatch(/_ink-wash_[a-z0-9]{6}\.mp4$/);
  });
});
