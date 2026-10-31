---
name: visual-check
description: Launch and drive the outer-spatial-reasoning app in headless Chromium to visually verify a UI or scene change, using the project's own Playwright harness instead of rediscovering how to run it.
---

# Visually verifying a change

This project has its own browser-driving harness, so running the app to check a
change never needs to be rediscovered or re-installed: `playwright` is already a
devDependency, and it reuses whatever Chromium build is already cached locally
(`~/Library/Caches/ms-playwright` or `~/.cache/ms-playwright`), so no download step
runs in a working checkout.

## Running an existing scenario

```bash
npm run visual-check -- scripts/visual-checks/<name>.mjs
```

This starts the Vite dev server on port 5183 (separate from the default 5173, so it
won't collide with a `npm run dev` you already have open), opens the page in headless
Chromium, runs the scenario against it, prints any console errors, and always tears
the dev server and browser down afterward -- even if the scenario throws.

Screenshots land in `scripts/visual-check-output/<scenario-name>-<NN>-<label>.png`
(gitignored). Read them with the Read tool to actually look at them before declaring
something fixed -- a scenario finishing without throwing only proves the DOM state
changed, not that the render looks right.

Existing scenarios:

- `scripts/visual-checks/view-selector.mjs` -- Moon/Sun/Custom camera view selector:
  checks that the Sun is actually on screen in the Sun view, and that dragging marks
  the selector "Custom" until a preset is clicked again.

## Writing a new scenario

A scenario file default-exports an async function:

```js
export default async function myScenario(page, { screenshot }) {
  await page.waitForSelector("#some-element");
  await screenshot("initial-state");
  await page.click("#some-button");
  await screenshot("after-click");
}
```

`page` is a Playwright `Page` already navigated to the running app. Put new
scenarios in `scripts/visual-checks/`, named after the feature they check -- they're
committed, so the next session verifying the same area reuses the file instead of
writing a one-off script.

## Gotchas specific to this app

- The scene is WebGL/Three.js on a `<canvas id="gl">`; there's nothing to assert in
  the DOM for most of it, so verification is screenshot-based. Drive camera state
  through the controls (`#view-moon`, `#view-sun`, `#play`, etc.) and read it back
  from their `aria-pressed` attributes where available, rather than trying to probe
  Three.js state from the page.
- The camera eases toward a new viewpoint rather than snapping; `waitForTimeout(600)`
  (or similar) after switching views gives it time to settle before a screenshot.
- Dragging the canvas: use `page.mouse.move/down/move/up` on `#gl`'s bounding box,
  not `page.click`, since rotation is a drag gesture.
