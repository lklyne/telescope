---
name: Group selection lifecycle
timeout: 90s
---

## Scenario

Use the HTTP control API to create two visible frames on the canvas and
group them together before starting UI interactions. Then, in the UI:
click the group background to select the group and verify only the group
appears selected. Double-click the group background to enter the group,
click one child frame to make the child selected, then click the group
background again and verify the child no longer appears selected. Finally,
ungroup the group from the left sidebar and verify the freed items are
selected together, then click empty canvas to deselect.

## Expected outcomes
- Clicking the group background shows group selected state
- Entering the group selects the children rather than leaving the group selected
- After selecting a child frame, clicking group background clears the child's selected state
- Ungrouping leaves the freed members selected together
- Clicking empty canvas clears the selection immediately after ungrouping

## Cleanup
- Delete any frames or groups created during this test
