# Phone test checklist

Run these on the phone in Chrome (Android) after each deploy. Each section is listed with the version that added it.

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
