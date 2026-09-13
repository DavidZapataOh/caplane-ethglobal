/**
 * Runs the mechanically checkable points against the real workflow source.
 *
 * The test suite proves the audit is well formed — every point claims a proof, every gate exists,
 * every artifact is on disk. That is not the same as the claims being true. These five are
 * decidable by reading the source, so they are decided here rather than asserted in prose.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { POINTS, renderAudit } from "./must-pass.ts";

const WORKFLOW = new URL("../../caplane-workflow/", import.meta.url).pathname;

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === "node_modules" || entry === "dist") return [];
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith(".ts") && !path.includes(".test.") ? [path] : [];
  });

const production = sources(WORKFLOW).map((path) => ({ path, body: readFileSync(path, "utf8") }));

const banned: Array<[number, RegExp, string]> = [
  [1, /\bDate\.now\(|\bnew Date\(/, "a wall clock"],
  [2, /\bMath\.random\(|crypto\.randomBytes\(/, "unseeded randomness"],
  [8, /Promise\.(race|any)\(/, "a timing-dependent combinator"],
  [15, /ConfidentialHTTPClient|vaultDonSecrets/, "an identifier forbidden inside a TEE handler"],
];

const found: string[] = [];
for (const [n, pattern, what] of banned) {
  for (const file of production) {
    if (pattern.test(file.body)) {
      found.push(`point ${n}: ${what} in ${file.path.split("/caplane/")[1]}`);
    }
  }
}

// Point 16 is the one where saying the wrong thing is the failure, so the claim is checked too.
const claimsBinaryIsPrivate = production.some((f) =>
  /(binary|logic)[^.\n]{0,40}(confidential|private|hidden)/i.test(f.body),
);
if (claimsBinaryIsPrivate) found.push("point 16: the source claims the workflow binary is confidential");

for (const line of found) console.error(`rubric: ${line}`);
console.log(
  found.length === 0
    ? `rubric: ${POINTS.length} points, ${banned.length + 1} checked against source, 0 violations`
    : `rubric: ${found.length} violation(s)`,
);

if (found.length === 0 && process.argv.includes("--write")) {
  const target = new URL("../../evidence/repo/02-sponsor-rubric.md", import.meta.url);
  const body = `${renderAudit()}\n\n<!-- Generated from scripts/rubric/. Edit the data there. -->\n`;
  const { writeFileSync } = await import("node:fs");
  writeFileSync(target, body);
  console.log("rubric: wrote evidence/repo/02-sponsor-rubric.md");
}

process.exit(found.length === 0 ? 0 : 1);
