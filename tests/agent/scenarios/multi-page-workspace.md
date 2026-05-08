---
name: Multi-frame workspace
timeout: 90s
---

## Scenario

Create three frames at different positions on the canvas, each pointing
at a different URL. Verify all three frames are visible and none overlap
each other. Use zoom-to-fit or zoom out so all frames are visible in the
viewport at once.

## Expected outcomes
- Three frames are present on the canvas
- The frames do not overlap each other
- All three frames are visible in the viewport simultaneously

## Cleanup
- Delete all frames created during this test
