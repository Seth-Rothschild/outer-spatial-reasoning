import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // archive/ holds extracted-but-not-deleted code and its old tests (see
    // notes/ui-direction.md) -- reference material, not run, not maintained.
    exclude: [...configDefaults.exclude, "archive/**"],
    coverage: {
      provider: "v8",
      include: ["src/astronomy.js", "src/ui.js", "src/textures.js"],
      // scene.js is excluded: it's WebGL/DOM wiring (Three.js scene graph, pointer
      // and keyboard handlers, canvas rendering) that unit tests can't exercise
      // meaningfully without mocking away everything it actually does.
      reporter: ["text", "json-summary"],
      thresholds: {
        "src/astronomy.js": { statements: 95, branches: 95, functions: 95, lines: 95 },
        "src/ui.js": { statements: 95, branches: 95, functions: 95, lines: 95 },
        // textures.js mixes pure, fully-tested noise math with canvas-drawing
        // functions (document.createElement("canvas"), 2D context calls) that need
        // a real browser and aren't worth faking with a heavy canvas polyfill just
        // for coverage numbers. The floor below is the pure-math share of the file;
        // raise it only by testing more pure logic, not by lowering the bar.
        "src/textures.js": { statements: 30, branches: 40, functions: 45, lines: 30 },
      },
    },
  },
});
