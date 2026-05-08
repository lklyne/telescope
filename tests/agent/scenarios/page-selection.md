---
name: Frame selection
timeout: 60s
---

## Scenario

Ensure at least one frame exists on the canvas (create one if needed).
Click on a frame to select it and verify a selection indicator appears.
Then click on the empty canvas background to deselect and verify the
selection indicator is gone.

## Expected outcomes
- Clicking a frame visually indicates it is selected
- Clicking the canvas background clears the selection

## Cleanup
- Delete any frames created during this test
