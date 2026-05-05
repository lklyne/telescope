# Spike — webContents.blur reliability for ADR 0001

ADR 0001 picks option B (rely on the focused frame's `webContents.blur` to detect click-away). This is reliable in steady state but flaky for window-level focus changes (Electron #22201). The spike confirms within-window WCV-to-WCV transitions are reliable enough to ship the click-to-enter model on.

## Setup

```
BLUR_SPIKE=1 pnpm dev
```

This wires `focus` / `blur` / `devtools-opened` / `devtools-closed` / `devtools-focused` listeners on every page `webContents` and on the chrome header `webContents`. Logs land in the main-process stdout (the terminal you ran `pnpm dev` in), prefixed with `[blur-spike]`.

## Scenarios to exercise

For each, click into a frame to give it focus, then perform the action and verify the expected log output.

1. **WCV-to-WCV: page → bgView**
   Click into a frame, then click the canvas background.
   *Expected:* `page:blur` fires.

2. **WCV-to-WCV: page → another page**
   Click into frame A, then click into frame B's body.
   *Expected:* `page:blur` on A, `page:focus` on B.

3. **WCV-to-WCV: page → sidebar / toolbar**
   Click into a frame, then click the left sidebar.
   *Expected:* `page:blur` fires.

4. **DevTools attach (companion case)**
   Click into a frame, then open DevTools for that frame (right-click → Inspect, or the chrome header devtools button).
   *Expected:* `page:devtools-opened`, possibly `page:blur` if focus moves to DevTools. **Decision needed**: if blur fires here, the focus model needs to suppress exit when `devtools-opened` precedes the blur within a small window (treat DevTools as a companion — ADR 0001).

5. **Native dialog (file picker)**
   Click into a frame that opens a file picker (e.g. an `<input type=file>` element). Cancel the picker.
   *Expected:* `page:blur` may or may not fire. Document which.

6. **Native dialog (alert/confirm)**
   Click into a frame, trigger a JS `alert()` (e.g. via DevTools console: `alert('hi')`), dismiss it.
   *Expected:* `page:blur` behavior. Document.

7. **Programmatic focus move (cross-frame)**
   Click into frame A, then have main programmatically `pageView.webContents.focus()` on frame B (simulate via `frame.executeJavaScript('window.focus()')` in DevTools console of B).
   *Expected:* `page:blur` on A, `page:focus` on B.

8. **Window blur (app loses focus)**
   Click into a frame, then ⌘-Tab to another app.
   *Expected:* per Electron #22201, blur may NOT fire. This is acceptable — `FocusReconciler` handles re-focus on app re-activation. Document the observed behavior.

9. **DevTools focused vs page focused**
   With DevTools open and attached to a frame, click into the DevTools panel vs into the page.
   *Expected:* `page:devtools-focused` for DevTools side. Confirm focus/blur do not flip-flop.

## Findings

_Fill in as scenarios are run. Each scenario gets:_

- **Observed:** what fired, in what order
- **Verdict:** ✅ matches expected / ⚠ matches with caveat / ❌ does not match
- **Implication:** what it means for the focus state machine

## Decision

After running all 9 scenarios, write the verdict at the bottom:

- ✅ **Option B viable** — proceed with Phase 1.
- ⚠ **Option B viable with companion-window logic** — proceed with Phase 1 plus the suppress-blur-near-devtools rule.
- ❌ **Option B unviable** — fall back to option A (4-strip aboveView). Update ADR 0001 with the reason.
