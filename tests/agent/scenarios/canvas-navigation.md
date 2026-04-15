---
name: Canvas navigation
timeout: 60s
---

## Scenario

Starting from the default canvas view, pan the canvas in any direction
and verify the viewport has shifted. Then zoom in and verify the canvas
content appears larger. Zoom back out and verify it returns to a
wider view.

## Expected outcomes
- The canvas viewport position changes after panning
- Content appears larger after zooming in
- Content appears smaller or at normal size after zooming out

## Cleanup
- None required (viewport changes are transient)
