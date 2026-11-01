import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // archive/ holds extracted-but-not-deleted code and its old tests (see
    // notes/ui-direction.md) -- reference material, not run, not maintained.
    exclude: [...configDefaults.exclude, "archive/**"],
    coverage: {
      provider: "v8",
      include: ["src/astronomy.js", "src/ui.js", "src/camera.js"],
      // scene.js and textures.js are excluded: scene.js is WebGL/DOM wiring (Three.js
      // scene graph, pointer and keyboard handlers, canvas rendering, texture loading)
      // and textures.js is now entirely canvas-drawing (document.createElement
      // ("canvas"), 2D context calls) since the real photo textures replaced its
      // procedural noise math -- neither can be exercised meaningfully by a
      // node-environment unit test without mocking away everything it actually does.
      // camera.js holds the part of that same camera/orientation/projection math that
      // *is* pure (three's math classes need no DOM or renderer), pulled out of
      // scene.js specifically so it can live here instead. Both excluded files are
      // covered by the Playwright visual-check scripts instead (see
      // scripts/visual-checks/).
      reporter: ["text", "json-summary"],
      thresholds: {
        "src/astronomy.js": { statements: 95, branches: 95, functions: 95, lines: 95 },
        "src/ui.js": { statements: 95, branches: 95, functions: 95, lines: 95 },
        "src/camera.js": { statements: 95, branches: 95, functions: 95, lines: 95 },
      },
    },
  },
});
