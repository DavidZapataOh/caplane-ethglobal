import { test, expect } from "bun:test";
import type { Snapshot } from "./scan";
import { report } from "./check";

const clean: Snapshot = { files: [], commitMessages: [], refNames: [], dependencies: [] };

test("exits zero on a clean tree", () => {
  expect(report(clean).exitCode).toBe(0);
});

test("exits one and names every violated rule", () => {
  const dirty: Snapshot = {
    ...clean,
    files: [{ path: "web/src/x.ts", content: "vi.mock('./y'); // see Sprint-01/02" }],
  };
  const r = report(dirty);
  expect(r.exitCode).toBe(1);
  expect(r.findings.map((f) => f.rule).sort()).toEqual([
    "no-mock-call-sites",
    "no-sprint-references",
  ]);
});
