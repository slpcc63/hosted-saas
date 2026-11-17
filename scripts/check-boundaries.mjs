#!/usr/bin/env node
// Name-based boundary check. Complements dependency-cruiser (which checks imports).
// Usage: node scripts/check-boundaries.mjs [--root <dir>]
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, resolve } from "node:path";

const rootArg = process.argv.indexOf("--root");
const root = resolve(rootArg > -1 ? process.argv[rootArg + 1] : process.cwd());
const config = JSON.parse(readFileSync(join(root, "guardrails.config.json"), "utf8"));
const exts = new Set(config.extensions);
const ignore = new Set(config.ignoreDirs);
const today = new Date().toISOString().slice(0, 10);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignore.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (exts.has(extname(name))) yield full;
  }
}

const violations = [];
const allowedHits = [];
const skipped = [];
let filesScanned = 0;

for (const rule of config.rules) {
  const re = new RegExp(rule.forbid.join("|"), rule.flags ?? "");
  for (const p of rule.paths) {
    const abs = join(root, p);
    if (!existsSync(abs)) {
      skipped.push(`${rule.id}: ${p} (does not exist yet)`);
      continue;
    }
    for (const file of walk(abs)) {
      filesScanned++;
      const rel = relative(root, file);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const m = line.match(re);
        if (!m) return;
        const exception = (config.allow ?? []).find(
          (a) => a.rule === rule.id && a.file === rel && new RegExp(a.pattern).test(line)
        );
        if (exception) {
          if (exception.expires && exception.expires < today) {
            violations.push({
              rule, rel, line: i + 1, hit: m[0],
              note: `EXPIRED exception (${exception.expires}): ${exception.reason}`
            });
          } else {
            allowedHits.push({
              rule: rule.id, rel, line: i + 1,
              reason: exception.reason, expires: exception.expires
            });
          }
          return;
        }
        violations.push({ rule, rel, line: i + 1, hit: m[0] });
      });
    }
  }
}

console.log(`Boundary check: ${filesScanned} files scanned, ${config.rules.length} rules.`);
for (const s of skipped) console.log(`  skipped  ${s}`);
for (const a of allowedHits) {
  console.log(`  ALLOWED  [${a.rule}] ${a.rel}:${a.line} - ${a.reason} (expires ${a.expires ?? "never"})`);
}
if (violations.length) {
  console.log(`\nFAIL: ${violations.length} violation(s)\n`);
  for (const v of violations) {
    console.log(`  [${v.rule.id}] ${v.rel}:${v.line}  matched "${v.hit}"${v.note ? "  " + v.note : ""}`);
  }
  const seen = new Set();
  console.log("\nWhy these rules exist:");
  for (const v of violations) {
    if (!seen.has(v.rule.id)) {
      seen.add(v.rule.id);
      console.log(`  ${v.rule.id}: ${v.rule.why}`);
    }
  }
  process.exit(1);
}
console.log("PASS");
