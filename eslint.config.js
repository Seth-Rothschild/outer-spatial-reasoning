import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  // archive/ holds extracted-but-not-deleted code (see notes/ui-direction.md) --
  // reference material, not maintained, not required to still pass lint.
  { ignores: ["dist/**", "node_modules/**", "archive/**"] },
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Cyclomatic complexity cap: keeps any one function from growing enough
      // decision paths to be hard to reason about or to test exhaustively.
      complexity: ["error", 10],
      "max-depth": ["error", 4],
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: { globals: { ...globals.node } },
  },
];
