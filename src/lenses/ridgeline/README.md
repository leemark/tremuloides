# Ridgeline Score (`ridgeline`)

Traces the skyline of a photo and plays it as music. The ridgeline is drawn on the image with a dot at each sampled note. On the saved photo, **Play** performs it with a playhead moving across the picture, and **WAV** and **MIDI** export it (MIDI for a DAW).

## Skyline detection (`skyline.ts`, CPU, 256 px wide sample)
1. Per pixel: Oklab, plus local texture (3×3 std-dev of lightness).
2. **Sky** = blue (b < −0.025, L > 0.5, texture < 0.05; stricter after hazy distant slopes read as sky in a field photo) or bright and nearly neutral (L > 0.6, C < 0.07, texture < 0.07), which covers clouds and haze. A pixel also needs sky 3 px to each side, because sky is wide and white aspen trunks are not (field test).
3. Each column is scanned **up from the ground**, starting at 90% height so lakes reflecting the sky don't count. The first run of 4 sky rows marks the ridge just below it. Field testing showed that top-down scans stop at the edges of fluffy clouds; scanning bottom-up means clouds above the mountains can't interfere.
4. Cleanup: a median filter (±6 columns) rejects outliers more than 6% of the height away, gaps are interpolated, then a light median (±2) is applied.
5. If fewer than half the columns start in sky (no visible sky, or a busy top edge), it falls back to the strongest vertical change in lightness and color in the top 80% of each column.

Limitation: bright snowfields can read as sky, in which case the line follows the snow line.

## Music (`score.ts`)
- **Pitch:** the ridge is sampled at **Notes** points. Height, normalized between the lowest and highest point, maps to scale degrees across **two octaves** starting at **Root** in octave 3 (D3–D5 by default).
- **Rhythm:** steep sections (normalized slope > 0.25) get eighth notes, the rest quarters. Flat stretches that repeat a pitch are tied into longer notes, up to 4 beats.
- **Dynamics:** higher peaks are louder.
- **Sparkles:** where bright autumn color (the Field Log warm-foliage test) fills more than 20% of the band just below the ridge, a mallet note two octaves up is added.
- **Seed:** only humanizes timing (±0.03 beat) and velocity.

## Sound (`synth.ts`, Web Audio only, no samples)
- **Melody voice:** triangle plus a quiet sine octave through a low-pass that closes after the attack, so it sounds soft and plucked.
- **Sparkles:** a two-partial mallet (1 : 2.76).
- **Room:** procedural reverb (seeded decaying noise impulse) and a gentle compressor.
- **Rendering:** normalized to −2 dBFS peak, with `OfflineAudioContext`, so playback and WAV export sound identical. (OfflineAudioContext isn't available in Web Workers, but its rendering runs off the JS thread.)

## Exports
- **WAV:** 16-bit stereo, 44.1 kHz (`wav.ts`).
- **MIDI:** standard MIDI file, format 0 at 480 PPQ (`midi.ts`). The melody is on channel 1 (Vibraphone), sparkles on channel 2 (Glockenspiel), with the tempo set from the Tempo param.

## Params
| Id | Range | Default |
|---|---|---|
| `notes` | 16–64 | 32 |
| `scale` | Major pentatonic / Minor pentatonic / Dorian / Lydian / Mixolydian | Major pentatonic |
| `root` | C–B | D |
| `tempo` | 60–140 BPM | 84 |
| `markers` | toggle | on |

The live preview re-traces the skyline 4 times a second. Audio is always generated from the saved photo (the original when kept), so it matches what you captured.

## v2: sky connected to the top (v0.17.1)
v1 scanned each column up from 90% of the height and stopped at the first run of sky. A mirror-calm lake reflecting the sky fooled it: the line traced the reflection. Now sky pixels in the top 35% of the frame seed a 4-connected flood fill through sky (same wide-sky test), and the ridge is just below the lowest connected sky pixel in each column. Reflections are cut off from the real sky by mountains and shore, so they never connect. Clouds that don't read as sky are flowed around rather than stopping the scan. Tests: `ignores sky reflected in a lake`, `flows around a cloud`.
