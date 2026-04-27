# Bundled binaries

This directory holds third-party binaries shipped inside the Specular app
bundle and exposed to the main process via environment variables.

## `agent-browser`

A pinned release of [vercel-labs/agent-browser][ab].

### How it's resolved at runtime

`src/main/agent-browser-install.ts` calls `configureBundledAgentBrowser()`
during app startup, which sets `AGENT_BROWSER_PATH` to this binary so the
existing resolver in `src/main/shared/browse-handler.ts` picks it up
**before** walking `$PATH`. **Bundled wins.** A user-installed
`agent-browser` on `$PATH` is detected and surfaced in the Setup window for
visibility, but is not used by Specular by default.

This keeps Specular on a known-good agent-browser version that's tested
against its CLI command surface.

### How updates flow

agent-browser updates ship inside Specular app updates:

1. New agent-browser release is published upstream.
2. Drop the binary into `resources/bin/agent-browser` (`chmod +x`).
3. Bump Specular's version in `package.json` and publish.
4. `update-electron-app` (already in `package.json`) auto-downloads the
   Specular update on the user's machine.
5. After restart, the new binary is in the app bundle and `AGENT_BROWSER_PATH`
   picks it up automatically.

No separate update channel for agent-browser.

### Manual override

A user who needs a specific agent-browser version can set
`AGENT_BROWSER_PATH` in their environment before launching Specular. The
value Specular sets at startup respects an existing env var and won't
overwrite it.

### Updating the bundled binary

1. Download the pinned release binary for the target platform.
2. Replace `resources/bin/agent-browser` with the new binary.
3. `chmod +x resources/bin/agent-browser`.
4. Verify: `./resources/bin/agent-browser --version`.
5. Commit the new binary alongside any matching skill changes in
   `resources/skills/agent-browser/`.

This directory is wired into `forge.config.ts` `extraResource` so its
contents are copied into the packaged app's `Resources/bin/`.

[ab]: https://github.com/vercel-labs/agent-browser
