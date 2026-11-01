# AGENTS.md

## Code quality bar

Hold every change to the standard in Robert C. Martin's *Clean Code*, not a
lower "good enough" bar.

### Comments

Code should be scannable and understandable without comments. If a reader
needs a comment to understand what a piece of code does, that's a signal to
rename or restructure the code, not to explain it. Default to no comments.
The only comments worth keeping explain a non-obvious *why* -- a hidden
constraint, a subtle invariant, a workaround for a specific bug, or behavior
that would genuinely surprise a reader. Never write a comment that explains
*what* the code does, or that exists only because a name or data shape wasn't
self-explanatory on its own.

```js
// Bad: the comment is doing the job the code should do on its own.
defaultYaw: Math.PI, // sit on the far side of Earth from the Moon

// Good: the name carries the meaning; no comment needed.
defaultYaw: FAR_SIDE_YAW,
```

```js
// Bad: explains *what*, which the code already says.
// Loop over all planets and update their position.
for (const planet of planets) updatePosition(planet);

// Good: no comment needed, the code reads as a sentence.
for (const planet of planets) updatePosition(planet);
```

### Naming

Every function and variable name should be as good as it can be, not just
good enough to compile and pass review. A name should let a reader predict
what a function returns or a variable holds without reading its body or
reaching for a comment. Avoid abbreviations, single-letter names (outside a
tight, conventional loop index), noise words (`data`, `info`, `manager`,
`helper`), and names so generic they could mean anything (`value`, `result`,
`temp`) unless the surrounding scope is a couple of lines long and the name's
scope is obviously tiny.

```js
// Bad: generic name, no sense of units or meaning without the comment.
let d; // elapsed days since epoch
function calc(a, b) { ... }

// Good: the name alone tells you the units and the role.
let elapsedDaysSinceEpoch;
function computeOrbitalPeriodInDays(semiMajorAxisAu) { ... }
```

```js
// Bad: "frameToward" needs a paragraph of prose elsewhere to explain what it
// means and what shape of value it expects.
const EARTH_TOWARD_MOON = {
  anchor: (frame) => frame.earthDisplayPos,
  frameToward: (frame) => frame.moonDisplayPos,
};

// Good: renamed to state the role directly -- a reader doesn't need the
// Viewpoint doc comment to guess what's going on.
const EARTH_TOWARD_MOON = {
  cameraOrbitsAround: (frame) => frame.earthDisplayPos,
  defaultVantageFacesAwayFrom: (frame) => frame.moonDisplayPos,
};
```

### Abstraction

A good helper hides complexity the reader doesn't need at the call site --
tricky math, serialization, parsing, anything with enough fiddly steps that
getting one wrong wouldn't be obvious. The call site should read as a
sentence; the fiddly part lives in one well-named, independently testable
function instead of being inlined wherever it's needed.

```js
// Bad: the SVG arc-path math for the Moon's lit disc is inlined at the one
// call site that happens to need it, so the render loop has to carry it too.
function renderFrame() {
  ...
  const waxing = elongation < 180;
  const terminatorRadius = 46 * Math.abs(Math.cos(elongation * (Math.PI / 180)));
  const isCrescent = elongation < 90 || elongation > 270;
  const edgeSweep = waxing ? 1 : 0;
  const terminatorSweep = waxing ? (isCrescent ? 0 : 1) : isCrescent ? 1 : 0;
  phaseLitPath.setAttribute(
    "d",
    `M50 4A46 46 0 0 ${edgeSweep} 50 96A${terminatorRadius.toFixed(2)} 46 0 0 ${terminatorSweep} 50 4Z`,
  );
  ...
}

// Good: the math is extracted into a named, pure, independently tested
// function (ui.js's litDiscPath) -- the render loop just states intent.
function renderFrame() {
  ...
  phaseLitPath.setAttribute("d", litDiscPath(50, 50, 46, elongation));
  ...
}
```

### Testing

Aim for 100% code coverage, and for tests that would survive mutation testing:
a test suite that merely executes every line without checking the right
values isn't enough. Each test should fail if the underlying logic were
subtly broken -- a `<` flipped to `<=`, a boundary shifted by one, a `&&`
turned into `||` -- not just if the code throws or crashes outright. Prefer
asserting exact expected values (and edge cases: boundaries, wraparound,
empty/zero input) over asserting something merely ran without error.

### Magic values

A magic value (a raw number, a bare `0`/`Math.PI`, an unexplained boolean)
that only makes sense alongside a comment should become a named constant, a
differently-shaped abstraction, or a function with a name that states its
intent -- not a value with a footnote.

```js
// Bad: 1.45 means nothing without the comment, and it's repeated at every
// call site that clamps pitch.
cameraPitchOffset = Math.max(-1.45, Math.min(1.45, cameraPitchOffset + dy * 0.006));

// Good: the limit's meaning travels with its name, and there's one definition.
const MAX_PITCH_RADIANS = 1.45; // ~83 degrees, just short of looking straight down
cameraPitchOffset = clamp(cameraPitchOffset + dy * 0.006, -MAX_PITCH_RADIANS, MAX_PITCH_RADIANS);
```
