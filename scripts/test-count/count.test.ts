import { test, expect } from "bun:test";
import { aggregate } from "./count";

// Captured from a real `arc-forge test --json` run, not invented.
const FORGE_REAL = JSON.stringify({
  "test/Placeholder.t.sol:PlaceholderTest": {
    duration: "8ms 770µs 583ns",
    test_results: {
      "test_Version_ReturnsOne()": { status: "Success", kind: { Unit: { gas: 56113 } } },
    },
    warnings: [],
  },
});

test("counts only the tests, not the suite's sibling keys", () => {
  expect(aggregate(FORGE_REAL, "12 pass\n0 fail\n", "abc1234")).toEqual({
    contractTests: 1,
    unitTests: 12,
    total: 13,
    commit: "abc1234",
  });
});

test("keeps contract tests distinct from unit tests", () => {
  const forge = JSON.stringify({
    "test/A.t.sol:A": { duration: "1ms", test_results: { "test_X()": {}, "test_Y()": {} }, warnings: [] },
    "test/B.t.sol:B": { duration: "1ms", test_results: { "test_Z()": {} }, warnings: [] },
  });
  const out = aggregate(forge, "12 pass\n0 fail\n", "abc1234");
  expect(out.contractTests).toBe(3);
  expect(out.unitTests).toBe(12);
});

test("counts zero when a runner reports no tests", () => {
  expect(aggregate("{}", "0 pass\n0 fail\n", "abc1234").total).toBe(0);
});

// The SDK's suite runs under `node --test`, which reports `# pass N` — a different shape from bun's
// `N pass`. Before this, a package on that runner was counted by neither arm and the total dropped
// it silently, which is the failure that looks like success.
test("counts a node --test runner as well as bun", () => {
  const out = aggregate("{}", "12 pass\n0 fail\n", "abc1234", "# tests 26\n# pass 26\n# fail 0\n");
  expect(out.unitTests).toBe(38);
  expect(out.total).toBe(38);
});

test("a missing node runner leaves the count where it was", () => {
  expect(aggregate("{}", "12 pass\n0 fail\n", "abc1234").unitTests).toBe(12);
});
