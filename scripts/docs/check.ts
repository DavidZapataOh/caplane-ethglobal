/**
 * Refuses when the committed documents are not what the data renders.
 *
 * Generating a document and committing it is only half a gate: the other half is that editing the
 * data and forgetting to regenerate leaves a file that looks authoritative and is stale. This is
 * the half that catches it, and it runs where the rest of the repository's gates already run.
 */
import { readFileSync } from "node:fs";
import { renderRelatedWork } from "./related-work.ts";
import { renderThreatModel } from "./threat-model.ts";

const NOTE = "\n\n<!-- Generated from scripts/docs/. Edit the data there, not this file. -->\n";

const documents: Array<[string, string]> = [
  ["THREATMODEL.md", renderThreatModel()],
  ["RELATED-WORK.md", renderRelatedWork()],
];

const stale = documents.filter(([name, body]) => {
  const committed = readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
  return committed !== `${body}${NOTE}`;
});

for (const [name] of stale) {
  console.error(`docs: ${name} is not what the data renders — run scripts/docs/build-docs.mjs`);
}
console.log(stale.length === 0 ? "docs: generated files match their data" : `docs: ${stale.length} stale`);
process.exit(stale.length === 0 ? 0 : 1);
