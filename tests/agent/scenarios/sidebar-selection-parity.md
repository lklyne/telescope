---
name: Sidebar selection parity
timeout: 90s
---

## Scenario

Use the HTTP control API to create two visible frames and a user group so
the left sidebar shows a group entry. First select the group by clicking
its background on the canvas and note the visible selected state. Then
select the same group from the left sidebar and verify the canvas shows the
same selected state. After that, select one frame from the left sidebar and
verify the group highlight clears and the frame becomes the only selected
item.

## Expected outcomes
- Canvas group selection and sidebar group selection produce the same visible highlight state
- Selecting a frame from the sidebar clears the group highlight
- After sidebar frame selection, only that frame appears selected

## Cleanup
- Delete any frames or groups created during this test
