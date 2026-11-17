/** Import-level rules. Complements scripts/check-boundaries.mjs (name-level). PROTECTED FILE.
 *  Requires devDependencies: dependency-cruiser and typescript@^5 (v7+ is unsupported and makes the
 *  tool silently skip .ts files, so CI also fails if it reports "missing-tsc-transpiler"). */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "cores-never-import-connectors",
      severity: "error",
      comment: "Cores depend on connector-kit interfaces, never on a concrete connector.",
      from: { path: "^packages/[a-z-]+-core/" },
      to: { path: "^packages/connector-[a-z]+/", pathNot: "^packages/connector-kit/" }
    },
    {
      name: "shared-never-imports-extensions",
      severity: "error",
      from: { path: "^packages/(identity|billing|connector-kit|runtime-kit)/" },
      to: { path: "^(apps|packages)/(sentinel|cadence|closeout|web)" }
    },
    {
      name: "extensions-never-import-the-hub",
      severity: "error",
      from: { path: "^(apps|packages)/(sentinel|cadence|closeout)" },
      to: { path: "^apps/web" }
    },
    {
      name: "sentinel-never-imports-other-extensions",
      severity: "error",
      comment: "Extensions must not reference each other.",
      from: { path: "^(apps|packages)/sentinel" },
      to: { path: "^(apps|packages)/(cadence|closeout)" }
    },
    {
      name: "cadence-never-imports-other-extensions",
      severity: "error",
      comment: "Extensions must not reference each other.",
      from: { path: "^(apps|packages)/cadence" },
      to: { path: "^(apps|packages)/(sentinel|closeout)" }
    },
    {
      name: "closeout-never-imports-other-extensions",
      severity: "error",
      comment: "Extensions must not reference each other.",
      from: { path: "^(apps|packages)/closeout" },
      to: { path: "^(apps|packages)/(sentinel|cadence)" }
    }
  ],
  options: { doNotFollow: { path: "node_modules" }, tsPreCompilationDeps: true }
};
