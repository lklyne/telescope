# Changelog

All notable changes to Specular will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/). Do not use prerelease suffixes (`-alpha.N`, `-beta.N`). `update.electronjs.org` filters based on GitHub's "prerelease" release flag (not the SemVer suffix), so tagged-alpha versions *can* reach clients — but mixing SemVer prerelease ordering with GitHub's flag is a footgun. Just increment patch/minor versions and keep releases as non-prereleases.

## [Unreleased]

## [0.2.7] - 2026-04-23 — Cursor Trails, Multi-Select

### New
- WebGPU particle trails behind agent cursors — speed-gated emission with noise-driven drift, so trails concentrate during fast movement and dissipate when idle
- Shift/Cmd-click toggles entities in and out of the current selection across frames, text, files, drawings, and groups

### Improvements
- Canvas zooms out to 2% (down from 10%), so huge spatial workspaces fit on screen
- Frames stay draggable when you click into one from a multi-selection

### Fixes
- Selected groups drag and resize cleanly under rapid input
- Shift/Cmd-click on a singly-selected frame now toggles selection instead of falling through to the webpage

### Misc
- Release skill documents the new two-commit flow (changelog, then version bump)

## [0.2.6] - 2026-04-21 — Presence Polish, Debug Window

Lots of refinement to how agent cursors move and retire, plus a new debug window for inspecting presence in flight.

### Improvements
- Agent cursors render in canvas space, so they no longer rubber-band during pan/zoom
- Cursor motion follows a Catmull-Rom spline with distance-scaled animation — short hops feel instant, long travel reads as intentional
- Scroll animates with an ease curve and dwells before moving, so the cursor lands at the origin before the page shifts
- Cursors fade out gracefully on idle-retire and session-done instead of popping
- Single-item creates, updates, and deletes across text, files, frames, links, groups, annotations, and camera focus all move the cursor now
- Each frame gets its own agent-browser session, so driving multiple frames in one app session routes to the right place
- `specular link <fromId> <toId>` accepts positional args alongside the stdin batch form

### Fixes
- Click timing: the cursor actually arrives before mousePressed lands, with a full travel+dwell window
- Agent cursor projections account for chrome height, so clicks no longer land 44px above their target
- Same-frame attach_frame no longer bounces the cursor to frame center
- Unresolvable click/fill refs no longer snap to frame center
- Sidebar inline edit layout
- Presence sessions refresh `lastSeenAt` on lookup, so active flows can't be reaped mid-sweep

### New
- Standalone debug window with a presence timeline and motion playground

### Misc
- LICENSE file (PolyForm Shield 1.0.0)
- Expanded README with feature list, install instructions, and MCP docs
- CONTRIBUTING, CODE_OF_CONDUCT, and SECURITY docs
- `.env.example` covering available environment variables
- Specular skill moved into the repo so branch edits stop leaking globally
- Internal planning docs moved to `docs/internal/`

## [0.2.1-alpha.9] - 2026-04-07

### Fixed
- Frame borders, chrome UX, and grid visibility tweaks

## [0.2.1-alpha.1] - 2026-04-06

### Added
- macOS code-signing and notarization
- Auto-updates via `electron-updater`
- GitHub Releases publishing via `@electron-forge/publisher-github`
- Release CI/CD workflow (`.github/workflows/release.yml`)
- Convenience release scripts (`pnpm release:alpha`, `release:patch`, `release:minor`)
- App icon source and generated `.icns`

## [0.2.0] - 2026-03

### Added
- Spatial canvas with real Chromium `WebContentsView` browser frames
- MCP server for agent control of canvas and browsers
- Agent presence with live cursor and task status
- Commenting and annotation overlay
- Device frame shells with preset sizes (iPhone, iPad, Laptop, etc.)
- Entity grouping with freeform, row, and grid layout modes
- Edge connections between canvas entities
- Yjs-based undo/redo with global undo stack
- Video recording with frame targeting
- CDP proxy for stable agent browser automation
- Contextual right panel with per-entity panes
- Floating UI menus for frame and entity actions
- Left sidebar with entity tree and tabs
- Obsidian `.canvas` file format for workspace persistence
- Smoke tests and agent test harness
