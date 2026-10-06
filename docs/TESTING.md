# Phone test checklist

Run these on the phone in Chrome (Android) after each deploy. Each section is listed with the version that added it.

## v0.17.0: Camera controls
1. In the viewfinder, a zoom chip (1.0×) sits bottom right. **Pinch** to zoom; the chip follows. Tap the chip to jump between 1× and 2×.
2. **Tap** the scene. A gold ring shows where it focuses, and a ☀ exposure bar appears. Drag it toward + on a backlit shot; it hides after 4 s.
3. Tap the EV value to reset to ±0.
4. Take a photo after zooming. Check whether the saved photo is zoomed too (phones differ; report what you see).
5. Settings → Diagnostics → Copy: `cameraControls` lists what your phone supports.

## v0.16.0: Overlays
1. Tap the lens name → scroll to **Overlay (any lens)** → **Contours**. Topo-style lines appear over the live lens; adjust **Overlay strength**.
2. Try **Ink lines** over Flow Painter and over Stained Glass (preview and saved photo).
3. Take a photo. Its info shows "Overlay: Contours 80%". Re-edit keeps the overlay.
4. Record a 5 s video with an overlay on; the clip includes it.
5. Set Overlay back to **None**. Everything looks as before.

## v0.15.0: Presets
1. Tap the lens name in the viewfinder. A **Presets** row sits at the top. Tap one (e.g. Ink & Wash → San Juan poster). The sliders jump and the chip lights up.
2. Move a slider. The chip un-highlights.
3. Tap **＋ Save**, name it, and Save. Your preset appears and is highlighted.
4. Open Import or Re-edit. The same presets are there.
5. Tap **×** on your preset and confirm. It's gone; built-ins can't be deleted.

## v0.14.0: Apply a lens to many photos
1. Gallery → **Select** (top right) → tap several photos (and a video, to check it's skipped) → **Apply lens**.
2. Pick a lens. The sheet shows its current settings. Tap **Render N photos with …**.
3. A progress bar shows "Lens: 2 of 8"; new versions appear in the gallery as they finish.
4. Tap **Stop** mid-way. It stops after the current photo.
5. Leave the gallery and come back while it runs. It keeps going.

## v0.13.0: Before/after
1. Open any lens photo that has its original and tap **Compare**. A sheet offers Reveal video and Side-by-side image.
2. **Side-by-side image**: the share sheet opens with original | lens.
3. **Reveal video**: the button counts up %, then the video opens. The lens wipes in from the left behind a white divider, holds, then wipes back, so it loops cleanly. About 7 s.
4. Videos don't show Compare (photos only).

## v0.12.0: Flow Painter timelapse
1. Open a Flow Painter photo and tap **Timelapse**. The painting appears over the photo and builds up stroke by stroke, while the button counts up %.
2. After about 12 s it opens the new video: photo → soft underpainting → big strokes → fine strokes → hold on the finished painting.
3. The video is in the Gallery (▶ badge) and, if the album is on, in Google Photos.
4. With Keep originals off, Timelapse says it needs the original.

## v0.11.0: Ink & Wash color fix
1. Re-edit the backlit brown-leaf photo and the trail-walker photo with Ink & Wash, **Palette: San Juan**. Leaves and gravel stay brown, and the canopy is gold/amber, not red.
2. Re-edit the looking-up trunk photo. The yellow canopy against blue sky shouldn't turn teal-green.
3. Drag **Palette strength** from 1 down to 0. It goes from the pure San Juan palette to the photo's own colors.
4. Gouache and Mono ink look unchanged.

## v0.10.0: Video clips
1. Pick **Ink & Wash**. Above the shutter, tap **Video**. The shutter turns red, and a **10 s** chip appears; tap it to cycle 5 / 10 / 15 s.
2. Tap the shutter. The indicator counts "● 0:03 / 0:10". It stops by itself, or tap again to stop early.
3. Open the Gallery. The tile shows **▶ 0:10**. Open it: the clip plays (muted; tap the speaker for sound). Try **Share** and **Save**.
4. Record again and swipe to Stained Glass halfway through. The clip should switch lenses.
5. Settings → turn on **Record sound with videos** and record a clip. Android asks for the microphone once.
6. With the phone album on, check Google Photos for the `.mp4`.
7. Flow Painter and Quake don't show the Photo/Video switch (they aren't live lenses).

## v0.9.1: Flow Painter phone fix
1. Re-edit the hotel-room photo with Flow Painter at **default** settings. Strokes should run up the cabinet doors and around the legs and blanket, not as flat horizontal blocks with stair-step edges.
2. Compare it with your v0.9.0 version in the gallery.

## v0.9.0: Flow Painter
1. Pick **Flow Painter**. The viewfinder shows a live painting with a "Full detail paints after capture" badge. Note whether panning feels smooth.
2. Take a photo. The indicator shows **Painting… N%**, then Saving…. Time it, roughly.
3. Open the photo. It should look like an oil painting with more fine detail than the viewfinder. Strokes follow ridges, trunks and clouds.
4. Tap **New seed**. Every stroke moves, but the picture stays the same.
5. In Import or Re-edit, try **Layers** 1 and 4, **Detail** 2, a long **Stroke length**, and **Canvas tone** Raw umber. The Render button counts up.
6. While a painting renders, keep using the viewfinder. It should stay responsive.

## v0.8.1: Album folder picker fix
1. Settings → Phone album → **Choose album folder**. The folder picker opens (no "Illegal invocation" toast).
2. Pick or create Pictures › Tremuloides and allow access. Status shows "✓ Saving to …".
3. Take a photo, then check Google Photos → Photos on device for it (and its _original).

## v0.8.0: Topo
1. Pick **Topo**. The viewfinder becomes a contour map: brown lines on cream, sky tinted blue, with thicker lines every fifth level. It should stay smooth while you pan.
2. Try **Smoothing** (0 is busy, 15+ is calm and rounded) and **Contour levels**. Lines should keep the same thickness at any setting.
3. Switch **Style** to Night and to Blueprint, and toggle **Hillshade**.
4. Take a photo and open it. It should look like the viewfinder, at full resolution.
5. Tap **SVG**. After "Tracing contours…" it should share or download a `.svg`. Open it in Inkscape or a browser: there's one layer per level plus a Background layer.
6. With **Keep originals** off, SVG says it needs the original.

## v0.7.0: Ridgeline Score
1. Pick **Ridgeline Score**. A gold line should follow the skyline (mountains against sky or clouds), with dots where notes are sampled. It updates as you pan.
2. Take a photo, open it, tap **Play**. You hear the ridgeline as a melody while a gold playhead moves across the photo. Tap **Stop**.
3. **WAV** and **MIDI** share or download the audio and the MIDI file. Open the MIDI in a DAW: melody on channel 1, sparkles on channel 2.
4. Lens settings: change **Scale**, **Root**, **Notes** and **Tempo**, take another shot and compare. **New seed** on a photo changes the humanization only.
5. Import an older photo and apply Ridgeline Score. Its audio is generated from the original.
6. Scenes with no visible sky fall back to the strongest edge. Note how that sounds.

## v0.6.1: Photo metadata
1. Take a photo with location on. In Google Photos (album folder, or after Share/Save), swipe up on it: the date/time is right and a map pin with the location appears.
2. In Files → photo → details (or any EXIF viewer), check that the elevation (GPS altitude) and the "Tremuloides" software tag are present.
3. Gallery: the gold **Field Log** button in the top bar opens the Field Log.

## v0.6.0: Phone album
1. Settings → **Phone album** → **Choose album folder**. In Android's picker, go to **Pictures**, create a folder **Tremuloides**, open it, and tap **Use this folder** → **Allow**. Settings shows "✓ Saving to Tremuloides".
2. Take a photo. Within a few seconds the Files app shows `Pictures/Tremuloides/tremuloides_…_<lens>_xxxxxx.jpg` plus `…_original.jpg`. The photo's detail screen shows "Album: Saved to phone".
3. Google Photos → Library → **Photos on device** → Tremuloides shows them (turn on backup there if you want).
4. **Copy existing photos** copies everything taken before the album was set up.
5. Force-close and reopen the app, then take a photo. If Android asks to allow folder access again, allow it. The photo (and any taken meanwhile) lands in the folder.
6. Turn off **Save originals too** and take a photo: only the lens version is written. On any photo, **Original** shares the unprocessed original.

## v0.5.1: Field tuning
1. Ink & Wash opens on **Gouache**. Red-orange and gold aspens and green spruce should keep their real colors.
2. Switch to **Auto**: aspens should read orange/gold, not brown. **San Juan**: meadows mostly Dry Grass, with few rust specks.
3. Stained Glass on a scene with grass in front: panes should be larger in the grass and clouds and smaller around trees and ridgelines.
4. Field Log: stripes refresh once ("Analyzing colors…"). Red-orange aspen shots now show a higher % warm.
5. Saved lens settings are kept, so to try the new Ink & Wash default, tap **Reset** in its settings.

## v0.5.0: Stained Glass
1. Pick **Stained Glass**. Panes should be small along tree lines and the ridge, larger in open sky, and re-arrange gently (about twice a second) as you move.
2. Lens settings → raise and lower **Cells** and **Edge attraction**; change **Lead width** and **Lead color**; toggle **Glass texture**; slide **Glow**.
3. Turn on **Freeze panes**, frame the shot, and take it. The saved photo should have the same pane layout as the viewfinder.
4. **New seed** (lens settings, or on a saved photo) reshuffles the panes.
5. Import a photo and apply Stained Glass. Check the lead lines are crisp at full size (pinch-zoom in Google Photos).
6. FPS overlay: the preview should hold about 24 fps or more. If not, lower Cells and note the FPS.

## v0.4.0: Field Log
1. Gallery → **chart icon** (Field Log). Older photos are analyzed in the background ("Analyzing colors… N to go"), then each photo shows as a palette stripe.
2. The header line shows photos, days, the elevation range (ft) and the % autumn color. Check that golden aspen shots have a higher % warm than sky or spruce shots.
3. **Elevation** tab: dots over time at the right heights. **Map** tab: your route, north up. Photos without GPS are counted, not shown.
4. Pencil icon: rename the trip and set start/end dates. The list updates.
5. **Make chromatograph poster** → try Time, Elevation, Rings and Grid, plus New seed → **Export PNG** → share or save it. Expect a few seconds for the 4800×7200 file.
6. Everything above also works in airplane mode.

## v0.3.0: Quake
1. Pick **Quake** (lens picker, or swipe). Point it at aspens moving in the wind. Leaves should smear and flow while the trunks stay sharp (Luma mode).
2. Tap the shutter and **hold still for about a second** ("Recording… %"). The photo appears in the Gallery.
3. Lens settings → try **Rows**, **Columns** and **Radial**, and change **Span**. Wave a hand through the frame to see the time offset.
4. Mode → **Slit-scan**. Tap the shutter, **slowly pan** across a grove for 5–10 s (the viewfinder shows the strip growing), then tap again to stop. It also stops on its own when the strip is full.
5. Leaving the viewfinder or switching lens mid-recording cancels it without a crash.
6. Settings → Diagnostics → Copy diagnostics includes a `temporal` section (history size and frames).

## v0.2.0: Ink & Wash
1. After updating, the viewfinder opens on **Ink & Wash**: painted look, dark ink outlines.
2. Point at golden aspens against dark spruce or blue sky. Gold should stay gold, conifers dark, and sky smooth with no blotches.
3. Tap the lens name and try each **Palette** (Auto, San Juan, Gouache, Mono ink). Auto shifts gently as you pan; it shouldn't flicker.
4. Raise **Brush size** and **Line amount**, then switch **Line style** to Flow. The preview updates live.
5. Turn on the FPS overlay (Settings → Diagnostics). At Balanced it should stay around 24 fps or higher; if not, try **Quality → Fast**.
6. Take a photo. Open it in the Gallery and compare it with what the preview showed: strokes and line weight should look the same, just sharper. Note how long Saving… takes.

## v0.1.0: Foundation

### Install and offline (do this before leaving coverage)
1. Open https://leemark.github.io/tremuloides/ in Chrome. Allow camera access.
2. Wait for the **"✓ Ready to work offline"** toast. Settings → About also shows it.
3. Chrome menu ⋮ → **Install app** (or Add to Home screen). Open it from the home screen icon.
4. Turn on **airplane mode**. Force-close the app and reopen it. It should launch straight into the viewfinder.
5. Still in airplane mode: take a photo, open the Gallery, open the photo, and share it. Everything should work.

### Camera and lenses
1. The viewfinder shows the live camera with **Posterize** applied.
2. Swipe left or right to switch lenses. The lens name toast appears.
3. Press and hold the preview. The "Original" badge shows the unprocessed view.
4. Tap the lens name. Move the Levels and Saturation sliders; the preview updates live. Close the sheet.
5. Take a photo in **portrait**, then one in **landscape**. Both should appear upright in the Gallery.
   - If one is sideways: Settings → Camera capture → **Video frame**, then send Diagnostics.
6. Open a photo and check that Location shows coordinates and elevation, as long as location was allowed.

### Gallery, editor, export
1. Gallery → open a photo → press and hold to compare with the original.
2. **Re-edit** → switch lens → **Render & save**. A new photo opens, marked "re-edit".
3. Viewfinder → **Import** (image icon) → pick a photo from the phone → Render & save.
4. **Share** a photo to Google Photos or Messages. **Save** puts it in Downloads.
5. Gallery → select icon → pick two photos → Share.
6. Delete a photo and confirm it's gone.

### Updates
1. After a new version is merged and deployed, open the app with a connection.
2. Within a minute (or via Settings → **Check for updates**), the **"Update ready: vX.Y.Z (sha)"** banner appears.
3. Tap **Reload**. Settings → About shows the new version, and existing photos are still there.

### If something breaks
- Settings → Diagnostics → **Copy diagnostics**, then paste it into a bug report (template in PROMPTS.md).
- Turn on the **FPS overlay** to see the frame rate and preview resolution.
