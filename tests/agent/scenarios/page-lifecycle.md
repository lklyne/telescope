---
name: Frame lifecycle
timeout: 60s
---

## Scenario

Create a new frame on the canvas pointing at any working URL.
Verify the frame appears, loads content from that URL, and shows the
selected state immediately after creation. Then click the empty canvas
background to deselect and verify the selection indicator clears without
needing any sidebar interaction. Finally delete the frame and confirm it
is no longer on the canvas.

## Expected outcomes
- A new frame is visible on the canvas after creation
- The frame displays loaded page content (not blank)
- The frame shows selected state immediately after creation
- Clicking empty canvas clears the selection immediately
- After deletion, the frame is no longer present on the canvas

## Cleanup
- Delete any frames created during this test
