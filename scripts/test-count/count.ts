export type TestCount = {
  contractTests: number;
  unitTests: number;
  total: number;
  commit: string;
};

type ForgeSuite = { test_results?: Record<string, unknown> };

/**
 * Kept separate because the field's competitive phrasing is "contract tests", not a sum.
 *
 * Three runners, not two. `node --test` reports `# pass N`, a different shape from bun's `N pass`,
 * and a package whose suite runs under it would be counted by neither arm — the count would drop a
 * whole package in silence, which is worse than a wrong number because nothing looks wrong.
 */
export const aggregate = (
  forgeJson: string,
  bunOutput: string,
  commit: string,
  nodeOutput = "",
): TestCount => {
  const suites = JSON.parse(forgeJson) as Record<string, ForgeSuite>;
  const contractTests = Object.values(suites).reduce(
    (n, suite) => n + Object.keys(suite.test_results ?? {}).length,
    0,
  );
  const bunPass = Number(bunOutput.match(/^\s*(\d+) pass\s*$/m)?.[1] ?? 0);
  // Summed across files: `node --test` prints one `# pass` block per invocation.
  const nodePass = [...nodeOutput.matchAll(/^# pass (\d+)$/gm)].reduce(
    (n, found) => n + Number(found[1]),
    0,
  );
  const unitTests = bunPass + nodePass;
  return { contractTests, unitTests, total: contractTests + unitTests, commit };
};
