# Changelog

All notable changes to Telescope will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/) with alpha pre-release tags.

## [Unreleased]

### Added
- LICENSE file (PolyForm Shield 1.0.0)
- Expanded README with feature list, install instructions, and MCP documentation
- CHANGELOG, CONTRIBUTING, CODE_OF_CONDUCT, and SECURITY community docs
- `.env.example` documenting all available environment variables

### Changed
- Moved internal planning docs to `docs/internal/`

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
