import { expect, test } from "bun:test";
import budgets from "../../budgets.json";
import limits from "../../prod-limits.json";
import { bytesOf, violations } from "./check";

// The platform writes "5kb" and the repository writes 5000. Their KByte is 1000, not 1024, and
// that conversion is where the error hides: read as 1024 the report budget looks 120 bytes
// roomier than it is.
test("platform sizes are decimal, not binary", () => {
  expect(bytesOf("5kb")).toBe(5000);
  expect(bytesOf("100kb")).toBe(100_000);
  expect(bytesOf("265b")).toBe(265);
  expect(bytesOf("5120")).toBe(5120);
  expect(bytesOf("300s")).toBeUndefined();
});

// Two files that must agree, and nothing compared them. A budget can drift above a limit and the
// first sign is an execution dying on a DON.
test("every budget sits inside the platform limit", () => {
  expect(violations(budgets, limits)).toEqual([]);
});

// And it has to bite: a comparison written backwards returns clean for everything.
test("a budget over its limit is a violation", () => {
  const over = { ...budgets, cre: { ...budgets.cre, httpCallsPerExecution: 6 } };
  expect(violations(over, limits)).toHaveLength(1);
});

test("a budget exactly at its limit is allowed", () => {
  const at = { ...budgets, cre: { ...budgets.cre, httpCallsPerExecution: 5 } };
  expect(violations(at, limits)).toEqual([]);
});

// The one that matters. A check that ignores what it does not recognise lets through exactly the
// new budget nobody tied to anything.
test("a budget with no matching limit is a violation, not a pass", () => {
  const invented = { ...budgets, cre: { ...budgets.cre, inventedQuota: 1 } };
  const found = violations(invented, limits);
  expect(found).toHaveLength(1);
  expect(found[0]).toContain("inventedQuota");
});

// Underscore-prefixed keys are prose: budgets.json carries its reasoning inline and none of it
// is a number to compare.
test("commentary keys are not budgets", () => {
  const noted = { ...budgets, cre: { ...budgets.cre, _note: "why this number" } };
  expect(violations(noted, limits)).toEqual([]);
});

// `cre` was the only branch anyone read, so every other budget in this file passed by never being
// looked at. A services latency budget has no platform limit to resolve against, so it is tied to a
// measurement — and a budget with nothing behind it has to fail, or it is decoration that reads as
// a gate.
test("a services budget with no measurement behind it is a violation", () => {
  const found = violations(
    { ...budgets, services: { api: { p95Ms: 400 }, mcp: { p95Ms: null } } } as typeof budgets,
    limits as Limits,
    {},
  );
  expect(found.some((line) => line.includes("services.api.p95Ms has no measurement behind it"))).toBe(true);
});

test("a measurement above its budget is a violation", () => {
  const found = violations(
    { ...budgets, services: { api: { p95Ms: 400 }, mcp: { p95Ms: null } } } as typeof budgets,
    limits as Limits,
    { "services.api.p95Ms": 981 },
  );
  expect(found.some((line) => line.includes("981 exceeds the budget of 400"))).toBe(true);
});

test("a null budget is not yet a budget and asks for nothing", () => {
  const found = violations(
    { ...budgets, services: { api: { p95Ms: null }, mcp: { p95Ms: null } } } as typeof budgets,
    limits as Limits,
    {},
  );
  expect(found.filter((line) => line.startsWith("services."))).toEqual([]);
});

// Iterated as a service, an underscore-prefixed commentary string yields its own characters as
// metric names — measured, 179 violations from one comment. The `cre` branch has always skipped
// them and this one has to as well.
test("commentary keys under services are not budgets", () => {
  const found = violations(
    {
      ...budgets,
      services: { _note: "why this exists", api: { p95Ms: null }, mcp: { p95Ms: null } },
    } as unknown as typeof budgets,
    limits as Limits,
    {},
  );
  expect(found.filter((line) => line.startsWith("services."))).toEqual([]);
});
