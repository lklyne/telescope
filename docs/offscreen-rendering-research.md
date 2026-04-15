# Offscreen Rendering Research

## Background

This document investigates GPU-accelerated offscreen rendering as a strategy for
improving performance when many web frames are displayed simultaneously on the
canvas. The current architecture creates a live Electron `WebContentsView` per
frame, each backed by its own Chromium renderer process. At scale (10+ frames),
this becomes a bottleneck — every frame maintains a full rendering pipeline,
composites independently, and consumes GPU/CPU resources even when off-screen or
idle.

## "Swizzle" / "Swizzy" Tool

Extensive searching found no browser or rendering tool specifically called
"Swizzle" or "Swizzy" matching the described behavior (rendering many webpages
via GPU offscreen compositing). The name may be misremembered. The closest
matches to the described functionality are:

- **Ultralight** (github.com/ultralight-ux/Ultralight, ~5k stars) — a
  lightweight HTML renderer that outputs directly to GPU textures. Designed for
  rendering many independent web views offscreen and compositing them in a single
  GPU pass. Uses WebKit under the hood with a custom GPU renderer (tessellated
  geometry + pixel shaders) or a CPU renderer (Skia + SIMD). This is the closest
  match to the described "browser that renders lots of different webpages using
  GPU rendering."

- **CEF Offscreen Rendering** — Chromium Embedded Framework supports an OSR mode
  where pages render to pixel buffers instead of windows, with paint callbacks
  carrying dirty rects. Used by OBS, Steam Overlay, Spotify desktop.

- **Servo/WebRender** — Mozilla's experimental GPU-first browser engine that
  treats pages as GPU draw command streams. Parallel rendering, but still
  experimental.

## Current Architecture

### How frames render today

Each frame in web-canvas is a set of three `WebContentsView` instances:

| View | Purpose |
|------|---------|
| `frameView` | Background/border layer (loads `about:blank`) |
| `pageView` | Actual web content — full Chromium renderer process |
| `chromeView` | Navigation chrome header (back/forward, URL bar) |

Created in `src/main/runtime/page-factory.ts:73-127`. Each `pageView` is a live,
fully interactive Chromium renderer positioned via `setBounds()` in the layout
engine (`src/main/runtime/layout-engine.ts:369-452`).

### Layout pipeline

```
mutation → requestLayout() → 16ms debounce timer
  → layoutAllViews()
    → compute screen bounds per page (runtime-geometry.ts)
    → setBounds() on each frameView, pageView, chromeView
    → send layout-update IPC to bgView renderer for borders/shells/chrome
    → apply device emulation if changed
```

### Performance characteristics of current approach

- **N frames = N renderer processes**: Each `WebContentsView` spawns a Chromium
  renderer process (~50-150MB RAM each). 20 frames ≈ 1-3GB overhead.
- **All frames render continuously**: Even frames that are off-screen or
  completely occluded still run their full rendering pipeline, execute JS timers,
  CSS animations, etc.
- **No viewport culling**: All frames are rendered simultaneously regardless of
  visibility (`src/main/runtime/layout-engine.ts:369` — iterates all pages).
- **Layout is O(N)**: Every `requestLayout()` call iterates all pages and
  recomputes bounds, emulation, annotations.
- **Existing compositing code**: `frame-compositor.ts` already captures frames
  via `capturePage()` and does per-pixel alpha blending for video recording and
  screenshot compositing. This proves the bitmap capture pipeline works.

## Electron Offscreen Rendering (OSR)

Electron (v40.8.0 in this project) supports offscreen rendering through
`BrowserWindow` with `webPreferences: { offscreen: true }`.

### How it works

When `offscreen: true` is set, Chromium's compositor outputs to an internal
buffer instead of a native window surface. The `webContents` emits `paint` events:

```typescript
win.webContents.on('paint', (event, dirty, image) => {
  // dirty: Rectangle — the sub-region that changed
  // image: NativeImage — the FULL frame as BGRA bitmap
})
```

### Key APIs

| API | Purpose |
|-----|---------|
| `webContents.setFrameRate(fps)` | Max paint event rate (up to 240fps) |
| `webContents.startPainting()` / `stopPainting()` | Pause/resume paint events |
| `webContents.invalidate()` | Force a repaint |
| `webPreferences.offscreen.useSharedTexture` | GPU shared texture mode (Electron 33+) |

### Three rendering modes

1. **Software (CPU)**: `app.disableHardwareAcceleration()` — Skia software
   rasterizer. No GPU-to-CPU copy cost, but no WebGL or GPU CSS. Fastest for
   static content.

2. **GPU + CPU bitmap (default OSR)**: GPU composites the frame, then copies to
   a CPU-side shared memory buffer. ~1-5ms readback cost per frame at 1080p.
   Supports WebGL and GPU CSS.

3. **GPU Shared Texture** (`useSharedTexture: true`, Electron 33+): Frames stay
   on the GPU as shared textures (D3D11 on Windows, IOSurface on macOS). Near
   zero-copy. Requires native addon to consume the texture handle. Fastest mode,
   but most complex to integrate.

### Limitations

- **`offscreen` is a BrowserWindow feature**, not directly available on
  `WebContentsView`. To use OSR, you'd create hidden `BrowserWindow` instances
  instead of `WebContentsView` instances for offscreen frames.
- **Input handling**: Offscreen windows don't receive native input events. You
  must forward mouse/keyboard events manually via
  `webContents.sendInputEvent()`.
- **Scrolling**: Must be synthesized via `sendInputEvent({ type: 'mouseWheel' })`.
- **Each offscreen window is still a full renderer process** — OSR doesn't
  reduce per-frame process overhead, only eliminates the native window surface
  compositing.

## Proposed Hybrid Architecture

The key insight: most frames on the canvas are **inactive** at any given time.
Only the selected frame (and its linked scroll-sync peers) need full
interactivity. Everything else can be a static bitmap that updates infrequently.

### Two-tier rendering

```
┌─────────────────────────────────────────────────────┐
│                    Canvas Surface                     │
│                                                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐              │
│  │ Bitmap  │  │ Bitmap  │  │ Bitmap  │  ← Tier 2:   │
│  │ (1 fps) │  │ (1 fps) │  │ (1 fps) │    Offscreen │
│  └─────────┘  └─────────┘  └─────────┘    bitmaps   │
│                                                       │
│  ┌───────────────────┐                                │
│  │   Live WCV        │  ← Tier 1: Full               │
│  │   (selected)      │    WebContentsView             │
│  │   60 fps, input   │    with real interaction       │
│  └───────────────────┘                                │
│                                                       │
│  ┌─────────┐  ┌─────────┐                            │
│  │ Linked  │  │ Linked  │  ← Tier 1b: Live WCVs     │
│  │ peer    │  │ peer    │    for scroll-sync peers    │
│  └─────────┘  └─────────┘                            │
└─────────────────────────────────────────────────────┘
```

**Tier 1 — Live (selected + linked peers)**:
- Rendered as real `WebContentsView` instances (current behavior).
- Full interactivity: native scrolling, input, focus, DevTools attachment.
- Only 1-4 frames typically in this tier.

**Tier 2 — Offscreen (everything else)**:
- Rendered via offscreen `BrowserWindow` instances with `offscreen: true`.
- `paint` events captured at low frame rate (1-5 fps).
- Bitmaps composited onto the canvas background layer (bgView) or a dedicated
  WebGL compositing surface.
- No native input — clicks on these frames trigger a "promote to Tier 1"
  transition.

### Tier transition

When the user selects a different frame:

1. **Demote** the previously selected frame: capture a final screenshot, destroy
   its `WebContentsView`, create an offscreen `BrowserWindow` to keep the page
   alive at low frame rate.
2. **Promote** the newly selected frame: destroy its offscreen `BrowserWindow`,
   create a live `WebContentsView` positioned at the correct canvas location,
   restore scroll position and focus.

For **linked/scroll-sync peers**: all frames in the sync group stay in Tier 1
so scroll events propagate with full fidelity.

### Compositing the offscreen bitmaps

Three approaches for drawing Tier 2 bitmaps onto the canvas, ordered by
complexity:

#### Option A: Canvas 2D in bgView (simplest)

The existing `bgView` renderer (canvas-bg) already draws frame borders, device
shells, chrome headers, text blocks, etc. Add a layer that draws offscreen frame
bitmaps as `<img>` elements or via `drawImage()` on a canvas.

```
Main process receives paint event → IPC bitmap to bgView renderer
  → renderer draws bitmap at frame's screen position
  → existing frame border/chrome layers draw on top
```

**Pros**: Minimal architecture change. bgView already knows frame positions.
**Cons**: IPC bandwidth for large bitmaps (~8MB per 1080p frame). BGRA→RGBA
conversion needed.

#### Option B: Shared texture + WebGL compositor (most performant)

Use `useSharedTexture: true` (Electron 33+, available in v40.8.0). Offscreen
frames render to GPU shared textures. A WebGL surface in the renderer composites
all textures in a single draw call.

```
Offscreen BrowserWindow renders → GPU shared texture
  → native addon maps texture handle to WebGL texture
  → WebGL compositor draws all frame textures at correct positions
  → Single GPU draw call for all offscreen frames
```

**Pros**: Near zero-copy, GPU-native compositing, scales to 50+ frames.
**Cons**: Requires a native Node.js addon, complex WebGL plumbing, platform-
specific texture handle mapping (D3D11 vs IOSurface vs EGL).

#### Option C: NativeImage + createImageBitmap (middle ground)

Use default OSR (CPU bitmap mode). Convert `NativeImage.toBitmap()` to
`ImageBitmap` via `createImageBitmap()`, then draw with `ctx.drawImage()`.

```
paint event → toBitmap() → IPC to renderer as SharedArrayBuffer
  → createImageBitmap() (async, off main thread)
  → ctx.drawImage(bitmap, x, y, w, h)
```

**Pros**: No native addon needed. `createImageBitmap` is GPU-backed.
**Cons**: Still has GPU→CPU→GPU round-trip. IPC overhead for large bitmaps.

### Recommended approach: Option A first, then Option B

Start with **Option A** (Canvas 2D in bgView) because:
- The bgView renderer already exists and handles frame positioning.
- `capturePage()` is already used throughout the codebase (video recording,
  screenshots, region capture in `frame-compositor.ts`).
- Minimal new infrastructure needed.
- Can be shipped incrementally — start with offscreen-at-rest (frames go
  offscreen after idle timeout), then refine.

Graduate to **Option B** (shared textures) if:
- IPC bandwidth becomes a bottleneck with many frames.
- The Canvas 2D compositing layer shows frame drops during pan/zoom.
- The project needs to support 30+ frames smoothly.

## Implementation Sketch

### Phase 1: Viewport culling (quick win, no OSR needed)

Before implementing full offscreen rendering, add viewport culling to
`layoutAllViews()`:

```typescript
// In layout-engine.ts, inside the page loop:
const screenBounds = boundScreenBoundsForPage(page)
const viewport = win.getBounds()
const isVisible = rectsOverlap(screenBounds.page, viewport)

if (!isVisible) {
  // Move views off-screen (current behavior for browser mode hidden pages)
  page.lastFrameBoundsKey = setBoundsIfChanged(page.frameView, HIDDEN_BOUNDS, ...)
  page.lastPageBoundsKey = setBoundsIfChanged(page.pageView, HIDDEN_BOUNDS, ...)
  page.lastChromeBoundsKey = setBoundsIfChanged(page.chromeView, HIDDEN_BOUNDS, ...)
  continue
}
```

This alone would significantly reduce GPU compositing work for frames outside
the viewport. The Chromium renderers still run, but they don't contribute to
the visible compositor output.

### Phase 2: Offscreen bitmap cache for idle frames

Add a bitmap cache that captures frames after they've been idle for N seconds:

```typescript
interface OffscreenFrameCache {
  pageId: string
  bitmap: NativeImage
  capturedAt: number
  scrollPosition: { x: number; y: number }
}
```

When a frame hasn't had any paint activity for 5+ seconds:
1. Capture a final `capturePage()` screenshot.
2. Store it in the cache.
3. Hide the `WebContentsView` (set bounds to 0,0,0,0).
4. Draw the cached bitmap in the bgView canvas layer.
5. On click/select, restore the live view and discard the cache.

### Phase 3: True offscreen rendering with BrowserWindow OSR

Replace the `WebContentsView` for inactive frames with offscreen
`BrowserWindow` instances:

```typescript
const offscreenWin = new BrowserWindow({
  show: false,
  webPreferences: {
    offscreen: true,
    preload: preloadPath('page-content'),
    contextIsolation: true,
  },
})
offscreenWin.webContents.setFrameRate(2) // 2 fps for idle frames
offscreenWin.webContents.on('paint', (event, dirty, image) => {
  // Update bitmap cache and notify bgView to redraw
})
offscreenWin.webContents.loadURL(page.url)
```

### Phase 4: GPU shared textures (advanced)

If needed, upgrade to `useSharedTexture: true` for zero-copy GPU compositing.
This requires a native Node.js addon to bridge the texture handle to WebGL.

## Key Architectural Decisions

### What stays as live WebContentsView

- The **selected frame** (always live for full interactivity)
- **Linked/scroll-sync peers** of the selected frame (need real-time scroll
  event propagation via `apply-linked-scroll` IPC)
- Frames **currently loading** (need `did-finish-load` events)
- Frames with **open DevTools** (DevTools attaches to webContents)

### What can go offscreen

- All other frames that are:
  - Not selected
  - Not linked to the selected frame
  - Done loading
  - Not being inspected

### Transition smoothness

The critical UX challenge is making the Tier 1 ↔ Tier 2 transition invisible:
- Capture a high-res bitmap just before demotion (already possible via
  `capturePage()`).
- Display the bitmap immediately while the offscreen BrowserWindow spins up.
- For promotion: show the cached bitmap while the live WebContentsView loads,
  then crossfade when ready.
- Preserve scroll position, form state, etc. across transitions (this is the
  hardest part — may need to serialize/restore via `executeJavaScript`).

### Scroll sync compatibility

For linked frames, all peers must stay in Tier 1. The existing scroll sync
pipeline (`src/shared/scroll-sync.ts` → `apply-linked-scroll` IPC) requires
live webContents to receive scroll events. Offscreen frames can't participate
in real-time scroll sync.

When a frame is promoted to Tier 1 (e.g., user selects a linked frame), all
its linked peers must also be promoted simultaneously.

## Performance Estimates

| Scenario | Current | With Phase 1 (culling) | With Phase 2 (bitmap cache) | With Phase 3 (OSR) |
|----------|---------|----------------------|---------------------------|-------------------|
| 5 frames, all visible | 5 renderer processes | 5 renderer processes | 5 processes (no idle) | 1 live + 4 OSR (2fps) |
| 20 frames, 5 visible | 20 renderer processes | 20 processes, 5 composited | 5 live + 15 cached bitmaps | 1 live + 4 visible OSR + 15 hidden OSR |
| 20 frames, 5 visible — GPU | ~2GB RAM, high GPU | ~1.5GB, lower GPU | ~1GB, minimal GPU for cached | ~800MB, minimal GPU |

## Risks and Open Questions

1. **State preservation across tier transitions**: How to preserve scroll
   position, form inputs, WebSocket connections, JS timer state when moving
   between live and offscreen? `capturePage()` only captures pixels, not state.

2. **BrowserWindow vs WebContentsView for OSR**: OSR requires `BrowserWindow`
   but the app uses `WebContentsView`. Need to manage two different view types
   and handle the lifecycle differences.

3. **IPC bandwidth**: At 1080p@2x DPR, each bitmap is ~32MB. Even at 2fps,
   that's 64MB/s per offscreen frame through IPC. May need shared memory or
   shared textures to avoid this.

4. **Electron version constraints**: GPU shared texture mode
   (`useSharedTexture`) is available in Electron 33+. The project uses v40.8.0,
   so this is available. However, the native addon required is non-trivial.

5. **Preload script compatibility**: Offscreen `BrowserWindow` instances would
   need the same preload scripts (`page-content.ts`) that current
   `WebContentsView` instances use. Need to verify IPC channel compatibility.

6. **DevTools**: Cannot attach DevTools to an offscreen frame without promoting
   it to Tier 1 first.

## Recommended Next Steps

1. **Implement viewport culling** (Phase 1) as an immediate quick win — low
   risk, no architectural change, measurable GPU reduction.

2. **Prototype bitmap caching** (Phase 2) for a single idle frame to validate
   the capture→cache→draw→restore cycle and measure the perceived transition
   latency.

3. **Benchmark IPC bandwidth** by sending `capturePage()` bitmaps from main
   to bgView renderer at various resolutions and frame rates to find the
   practical ceiling.

4. **Investigate `webContents.capturePage()` with dirty rects** — the existing
   compositor code in `frame-compositor.ts` captures full frames. A dirty-rect
   approach could reduce bandwidth significantly.

5. **Evaluate Ultralight** as a longer-term alternative if Electron's OSR proves
   too heavy — Ultralight's GPU texture approach would be far more efficient for
   50+ frames, but would require a complete rendering backend replacement.
