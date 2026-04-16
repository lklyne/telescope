# Bundled binaries

This directory holds third-party binaries shipped inside the Telescope app
bundle and exposed to the main process via environment variables.

## `agent-browser`

A pinned release of [vercel-labs/agent-browser][ab]. At app startup,
`src/main/agent-browser-install.ts` sets `AGENT_BROWSER_PATH` to this file so
the existing resolver in `src/main/shared/browse-handler.ts` picks it up
without requiring a user-PATH install.

Expected path: `resources/bin/agent-browser`

To update:

1. Download the pinned release binary for the target platform.
2. Replace `resources/bin/agent-browser` with the new binary.
3. `chmod +x resources/bin/agent-browser`.
4. Verify: `./resources/bin/agent-browser --version`.
5. Commit the new binary.

Note: this directory is wired into `forge.config.ts` `extraResource` so its
contents are copied into the packaged app's `Resources/bin/`.

[ab]: https://github.com/vercel-labs/agent-browser
