const { FlatCompat } = require("@eslint/eslintrc");
const tseslint = require("typescript-eslint");
const js = require("@eslint/js");
const path = require("path");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
});

module.exports = tseslint.config(
  // ── Files to lint ───────────────────────────────────────────────────────────
  { files: ["src/**/*.ts"] },

  // ── Files to ignore ─────────────────────────────────────────────────────────
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "src/**/__tests__/**",   // tests are linted separately below
    ],
  },

  // ── Base JS recommended rules ────────────────────────────────────────────────
  js.configs.recommended,

  // ── TypeScript-ESLint recommended rules ─────────────────────────────────────
  ...tseslint.configs.recommended,

  // ── Airbnb base (bridged via FlatCompat) ─────────────────────────────────────
  ...compat.extends("airbnb-base"),

  // ── TypeScript + import resolver settings ────────────────────────────────────
  {
    settings: {
      "import/resolver": {
        typescript: {
          project: path.resolve(__dirname, "tsconfig.json"),
        },
        node: { extensions: [".ts", ".js"] },
      },
      "import/extensions": [".ts", ".js"],
    },
  },

  // ── Source-code overrides ────────────────────────────────────────────────────
  {
    files: ["src/**/*.ts"],
    rules: {
      // TypeScript handles this itself — no need for the JS rule
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],

      // Hoisted function declarations are intentionally used before their definition site
      "no-use-before-define": ["error", { functions: false, classes: true, variables: true }],

      // Property mutation on local objects is fine; we don't mutate function arguments themselves
      "no-param-reassign": ["error", { props: false }],

      // `void promise` is idiomatic TypeScript for fire-and-forget
      "no-void": ["error", { allowAsStatement: true }],

      // Prefer TypeScript imports with .js extension (needed for NodeNext output)
      "import/extensions": ["error", "ignorePackages", { ts: "never", js: "always" }],

      // Airbnb disallows `for...of`; TypeScript iterables are fine
      "no-restricted-syntax": [
        "error",
        { selector: "LabeledStatement", message: "Labels are a code smell." },
        { selector: "WithStatement", message: "`with` is disallowed." },
      ],

      // Allow class methods that don't use `this` (common in controllers)
      "class-methods-use-this": "off",

      // Console is intentional in this service (structured logging)
      "no-console": "off",

      // TypeScript function return types are enforced by tsc, not ESLint
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",

      // Allow `any` only with a warning — keep the noise low
      "@typescript-eslint/no-explicit-any": "warn",

      // Airbnb requires default exports; we use named exports throughout
      "import/prefer-default-export": "off",

      // Allow devDependencies in config files at the root
      "import/no-extraneous-dependencies": [
        "error",
        { devDependencies: ["**/*.test.ts", "jest.config.js", "eslint.config.js"] },
      ],
    },
  },

  // ── Test-file overrides ──────────────────────────────────────────────────────
  {
    files: ["src/**/__tests__/**/*.ts"],
    rules: {
      // Tests routinely import devDependencies
      "import/no-extraneous-dependencies": "off",
      // Dynamic imports in integration test helpers are fine
      "@typescript-eslint/no-require-imports": "off",
    },
  }
);
