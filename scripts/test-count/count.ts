export type TestCount = {
  contractTests: number;
  unitTests: number;
  total: number;
  commit: string;
};

type ForgeSuite = { test_results?: Record<string, unknown> };

/** Kept separate because the field's competitive phrasing is "contract tests", not a sum. */
export const aggregate = (forgeJson: string, bunOutput: string, commit: string): TestCount => {
  const suites = JSON.parse(forgeJson) as Record<string, ForgeSuite>;
  const contractTests = Object.values(suites).reduce(
    (n, suite) => n + Object.keys(suite.test_results ?? {}).length,
    0,
  );
  const unitTests = Number(bunOutput.match(/^\s*(\d+) pass\s*$/m)?.[1] ?? 0);
  return { contractTests, unitTests, total: contractTests + unitTests, commit };
};
