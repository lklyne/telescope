---
name: agent-browser
description: Browser automation for live web pages. Use this skill when you need to navigate, inspect, or interact with a web page programmatically — especially when iterating on UI in Telescope. Invoked via the `telescope` CLI's browse subcommands.
---

# agent-browser

`agent-browser` is the browser-automation backend Telescope uses for the
`snapshot`, `click`, `fill`, `type`, `select`, `screenshot`, `scroll`, and
`wait` subcommands. When you use Telescope, you are usually using agent-browser
through the `telescope` CLI.

## Core workflow

1. Navigate to the page (Telescope does this when you `telescope create frame <url>`).
2. `telescope snapshot -i` — get an accessibility tree with stable refs.
3. Act: `telescope click @e5`, `telescope fill @e3 "hello"`, etc.
4. Re-snapshot after any DOM mutation — refs go stale.

## Selectors

agent-browser uses **refs** (`@e5`, `@e3`…) from the latest snapshot, not CSS
or XPath. Refs are stable per snapshot but invalidated by mutations.

## See also

This file is a compact reference. For the full agent-browser vocabulary
(authentication, iframes, eval, diffing, video recording, iOS simulator), see
the upstream agent-browser documentation.
