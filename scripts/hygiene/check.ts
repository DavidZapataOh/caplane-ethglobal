import { scan, type Finding, type Snapshot } from "./scan";
import { ALL_RULES } from "./rules";

export const report = (s: Snapshot): { exitCode: 0 | 1; findings: Finding[] } => {
  const findings = ALL_RULES.flatMap((rule) => rule(s));
  return { exitCode: findings.length === 0 ? 0 : 1, findings };
};

if (import.meta.main) {
  const { exitCode, findings } = report(await scan(process.cwd()));
  for (const f of findings) console.error(`${f.rule}: ${f.where} — ${f.detail}`);
  console.log(findings.length === 0 ? "hygiene: clean" : `hygiene: ${findings.length} finding(s)`);
  process.exit(exitCode);
}
