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
  // Which rules fired, not how many patterns each matched: one string can trip several shapes
  // inside a single rule, and that count is an implementation detail.
  expect([...new Set(r.findings.map((f) => f.rule))].sort()).toEqual([
    "no-mock-call-sites",
    "no-sprint-references",
  ]);
});
