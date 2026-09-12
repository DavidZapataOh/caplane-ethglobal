/**
 * Compares the repository's budgets against the platform's limits.
 *
 * Nothing did this before: `budgets.json` appeared twice in the whole tree and neither was a
 * gate, so the two files could drift apart in silence — which is exactly how a quota is
 * discovered in production rather than in CI.
 *
 * Hermetic. No credentials, no network, no toolchain — it reads two committed files and, for the
 * budgets that have no platform limit to resolve against, a committed measurement.
 */
import { readFileSync } from "node:fs";
import budgets from "../../budgets.json";
import limits from "../../prod-limits.json";

/**
 * The platform writes sizes as strings with a unit; the repository writes plain numbers. Their
 * KByte is 1000, not 1024 — measured against their own values, where the 5kb report limit is the
 * 5120 the EVM block spells out and the 5kb log-trigger limit is 5000. Read as 1024 the report
 * budget would look 120 bytes roomier than it is, which is the sort of error that survives review.
 *
 * Durations return undefined: they are limits, but not ones expressible in bytes.
 */
export const bytesOf = (value: string): number | undefined => {
  const match = /^(\d+)(b|kb|mb)?$/i.exec(value.trim());
  if (match === null) return undefined;
  const scale = { b: 1, kb: 1_000, mb: 1_000_000 }[(match[2] ?? "b").toLowerCase()] ?? 1;
  return Number(match[1]) * scale;
};

const secondsOf = (value: string): number | undefined => {
  const match = /^(?:(\d+)m)?(\d+(?:\.\d+)?)s$/.exec(value.trim());
  return match === null ? undefined : Number(match[1] ?? 0) * 60 + Number(match[2]);
};

type Limits = typeof limits;

/**
 * Where each budget's limit lives, resolved out of the platform file rather than copied from it.
 * A budget with no entry here is a violation, not a pass: a check that ignores what it does not
 * recognise lets through precisely the new budget nobody tied to anything.
 */
const RESOLVERS: Record<string, (l: Limits) => number | undefined> = {
  httpCallsPerExecution: (l) => Number(l.HTTPAction.CallLimit),
  httpRequestBytes: (l) => bytesOf(l.HTTPAction.RequestSizeLimit),
  httpResponseBytes: (l) => bytesOf(l.HTTPAction.ResponseSizeLimit),
  chainReadCallsPerExecution: (l) => Number(l.ChainRead.CallLimit),
  secretCallsPerExecution: (l) => Number(l.Secrets.CallLimit),
  executionTimeoutSeconds: (l) => secondsOf(l.ExecutionTimeout),
  reportPayloadBytes: (l) => bytesOf(l.ChainWrite.EVM.ReportSizeLimit),
  logTriggerEventBytes: (l) => bytesOf(l.LogTrigger.EventSizeLimit),
  triggerSubscriptions: (l) => Number(l.TriggerSubscriptionLimit),
  triggerSubscriptionLimit: (l) => Number(l.TriggerSubscriptionLimit),
};

/**
 * The report budget is the raw limit minus the forwarder's header, so it is checked against the
 * raw limit and not against itself. Measured: a 576-byte body is presented to the limiter as 685.
 */
const DERIVED: Record<string, (l: Limits) => number | undefined> = {
  "report.bodyBudgetBytes": (l) => bytesOf(l.ChainWrite.EVM.ReportSizeLimit),
};

/**
 * The measurements a self-standing budget is compared against.
 *
 * `cre` is backed by the platform's own limits file, so it needs nothing else. A latency budget has
 * no upstream limit to resolve — there is no such number in `prod-limits.json` and inventing one
 * there would corrupt a verbatim copy of the platform's contract. So a services budget is tied to a
 * measurement instead, and a budget with no measurement behind it is a violation rather than a pass:
 * a number nothing compares reads as a gate and is not one.
 */
export const measured = (): Record<string, number> => {
  try {
    return JSON.parse(readFileSync("evidence/measured.json", "utf8")) as Record<string, number>;
  } catch {
    return {};
  }
};

export const violations = (
  b: typeof budgets,
  l: Limits,
  m: Record<string, number> = measured(),
): string[] => {
  const found: string[] = [];

  for (const [service, entries] of Object.entries(b.services).sort()) {
    // Underscore-prefixed keys carry the reasoning inline, exactly as they do under `cre`. Iterated
    // as a service, one of them yields its characters as metrics — measured, 179 violations.
    if (service.startsWith("_")) continue;
    for (const [metric, budget] of Object.entries(entries as Record<string, number | null>).sort()) {
      if (metric.startsWith("_") || budget === null) continue;
      const key = `services.${service}.${metric}`;
      const seen = m[key];
      if (seen === undefined) {
        found.push(`${key} has no measurement behind it`);
        continue;
      }
      if (seen > budget) found.push(`${key} ${seen} exceeds the budget of ${budget}`);
    }
  }

  for (const [key, value] of Object.entries(b.cre).sort()) {
    // Underscore-prefixed keys carry the reasoning inline; none of them is a number.
    if (key.startsWith("_")) continue;

    if (key === "report") {
      const body = value as Record<string, number>;
      const cap = DERIVED["report.bodyBudgetBytes"]?.(l);
      if (cap === undefined) found.push("report.bodyBudgetBytes has no platform limit");
      else if (body.bodyBudgetBytes > cap) {
        found.push(`report.bodyBudgetBytes ${body.bodyBudgetBytes} exceeds ${cap}`);
      } else if (body.bodyBytes > body.bodyBudgetBytes) {
        found.push(`report.bodyBytes ${body.bodyBytes} exceeds ${body.bodyBudgetBytes}`);
      }
      continue;
    }

    const limit = RESOLVERS[key]?.(l);
    if (limit === undefined) {
      found.push(`${key} has no platform limit backing it`);
      continue;
    }
    if (typeof value === "number" && value > limit) {
      found.push(`${key} ${value} exceeds the platform limit of ${limit}`);
    }
  }

  return found;
};

if (import.meta.main) {
  const found = violations(budgets, limits);
  for (const line of found) console.error(`budget: ${line}`);
  console.log(found.length === 0 ? "budgets: within platform limits" : `budgets: ${found.length} violation(s)`);
  process.exit(found.length === 0 ? 0 : 1);
}
