---
name: Dual-surface workflow
timeout: 120s
---

## Scenario

Create or identify a frame on the Specular canvas using MCP tools, then
use the `browse` tool to inspect the page inside it. Navigate to a
different page via `browse(command: "click @eN")` and verify the frame
URL updates back in Specular. Re-snapshot after navigation to get fresh
refs. Then switch to a second frame by specifying a different `frame_id`
in the `browse` call and repeat the browser workflow there.

Run the browser phase sequentially: finish the first frame before
browsing the second frame.

## Expected outcomes
- `browse(command: "snapshot -i")` returns an accessibility tree with `@eN` refs
- `browse(command: "click @eN")` interacts with elements inside the frame
- Browser navigation updates the frame URL in Specular
- Switching to a second frame works by passing a different `frame_id` to `browse`
- The workflow is executed one frame at a time
- Presence cursor animates during browse operations

## Notes
- Canvas-side semantic presence appears automatically during MCP tool
  calls (create_frames, get_workspace, etc.).
- In-frame cursor movement happens automatically when the CDP proxy
  intercepts mouse and keyboard events during `browse` commands.

## Cleanup
- Remove any frames or notes created only for the scenario
