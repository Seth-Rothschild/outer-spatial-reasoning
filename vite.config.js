import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Bundles to one dist/index.html, matching how this page started life and gets shared.
export default defineConfig({
  plugins: [viteSingleFile()],
});
