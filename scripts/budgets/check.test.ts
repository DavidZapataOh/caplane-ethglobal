import { expect, test } from "bun:test";
import budgets from "../../budgets.json";
import limits from "../../prod-limits.json";
import { bytesOf, measured, violations } from "./check";

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

// The loader resolved its path against the process's working directory and swallowed the miss, so
// running the checker from anywhere but the repository root reported every measured budget as
// unmeasured. This suite runs in its own directory, which is how it went unnoticed: the file it
// could not find was the file it was asserting about.
test("the measurements are found from any working directory", () => {
  expect(Object.keys(measured())).not.toHaveLength(0);
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

// The web branch had the same problem the services branch did: a number nobody read. A route's
// first load is not backed by any platform limit — there is no such thing in prod-limits.json and
// inventing one there would corrupt a verbatim copy of the platform's contract — so it is tied to a
// measurement taken from the built artifact.
test("a web budget with no measurement behind it is a violation", () => {
  const found = violations(
    { ...budgets, web: { registryDeltaGzipBytes: 8000 } } as unknown as typeof budgets,
    limits as Limits,
    {},
  );
  expect(found.some((line) => line.includes("web.registryDeltaGzipBytes has no measurement behind it"))).toBe(true);
});

test("a route that grew past its budget is a violation", () => {
  const found = violations(
    { ...budgets, web: { registryDeltaGzipBytes: 8000 } } as unknown as typeof budgets,
    limits as Limits,
    { "web.registryDeltaGzipBytes": 51_000 },
  );
  expect(found.some((line) => line.includes("51000 exceeds the budget of 8000"))).toBe(true);
});

// en scripts/budgets/check.test.ts, junto a los tests existentes de la rama web
test("a site budget with no measurement behind it is a violation, same as web", () => {
  const b = { web: {}, site: { firstLoadJsBytes: 100 }, services: {}, cre: {} };
  const found = violations(b as any, limits, {});
  expect(found).toContain("site.firstLoadJsBytes has no measurement behind it");
});

test("a site measurement over its budget is a violation", () => {
  const b = { web: {}, site: { firstLoadJsBytes: 100 }, services: {}, cre: {} };
  const found = violations(b as any, limits, { "site.firstLoadJsBytes": 150 });
  expect(found).toContain("site.firstLoadJsBytes 150 exceeds the budget of 100");
});

test("a site measurement within its budget is not a violation", () => {
  const b = { web: {}, site: { firstLoadJsBytes: 100 }, services: {}, cre: {} };
  expect(violations(b as any, limits, { "site.firstLoadJsBytes": 90 })).toEqual([]);
});

// The nested shape the investor console already committed to for per-route deltas — a plain "typeof !== number"
// guard would silently skip this object forever, the same class of gap as b.site.
test("a route budget with no measurement behind it is a violation, named by its full path", () => {
  const b = { web: { routes: { "dark/invest": { firstLoadDeltaBytesGzip: 9000, against: "dark" } } }, site: {}, services: {}, cre: {} };
  const found = violations(b as any, limits, {});
  expect(found).toContain("web.routes.dark/invest.firstLoadDeltaBytesGzip has no measurement behind it");
});

test("a route measurement over its own budget is a violation, independent of any other route", () => {
  const b = {
    web: { routes: {
      "dark/invest": { firstLoadDeltaBytesGzip: 9000, against: "dark" },
      "dark/confirm": { firstLoadDeltaBytesGzip: 3000, against: "dark" },
    } },
    site: {}, services: {}, cre: {},
  };
  const found = violations(b as any, limits, {
    "web.routes.dark/invest.firstLoadDeltaBytesGzip": 9500,
    "web.routes.dark/confirm.firstLoadDeltaBytesGzip": 2000,
  });
  expect(found).toEqual(["web.routes.dark/invest.firstLoadDeltaBytesGzip 9500 exceeds the budget of 9000"]);
});

// The gap this file already closed twice, found a third time: a nested object under a surface was
// skipped by the "not a number, ignore it" filter, and `routes` was special-cased by name. Anything
// else nested — `vitals`, or whatever comes next — stayed invisible and its budget decorative.
// Walking nested objects generically is what stops the fourth occurrence.
test("a nested budget is walked whatever it is called, not only when it is `routes`", () => {
  const b = { web: { vitals: { lcpMs: 3000 } }, site: {}, services: {}, cre: {} };
  expect(violations(b as any, limits, {})).toContain("web.vitals.lcpMs has no measurement behind it");
});

test("a nested measurement over its budget is a violation, named by its full path", () => {
  const b = { web: { vitals: { lcpMs: 3000 } }, site: {}, services: {}, cre: {} };
  expect(violations(b as any, limits, { "web.vitals.lcpMs": 3500 })).toContain(
    "web.vitals.lcpMs 3500 exceeds the budget of 3000",
  );
});

test("a nested measurement within its budget is clean", () => {
  const b = { web: { vitals: { lcpMs: 3000, clsScore: 0.1 } }, site: {}, services: {}, cre: {} };
  expect(violations(b as any, limits, { "web.vitals.lcpMs": 2467, "web.vitals.clsScore": 0 })).toEqual([]);
});
