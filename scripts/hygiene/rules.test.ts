import { test, expect } from "bun:test";
import type { Snapshot } from "./scan";
import {
  brandInvariants,
  noMockDependencies,
  noMockCallSites,
  noLoopbackUrls,
  noTemplateMockServer,
  noSprintReferences,
  noPlanningVocabulary,
  noForbiddenCreIdentifiers,
  onlyApprovedTeeConstraint,
  noCommittedCredentials,
  noTemplateScaffolding,
  frozenArtifactsAreIdentical,
  secretNamesAreRegistered,
  ALL_RULES,
} from "./rules";

const snap = (p: Partial<Snapshot>): Snapshot => ({
  files: [],
  commitMessages: [],
  refNames: [],
  dependencies: [],
  ...p,
});

test("accepts mockCall inside vendored forge-std", () => {
  const s = snap({
    files: [
      {
        path: "contracts/lib/forge-std/src/Vm.sol",
        content: "function mockCall(address,bytes calldata,bytes calldata) external;",
      },
    ],
  });
  expect(noMockCallSites(s)).toEqual([]);
});

test("flags a mock library in first-party dependencies", () => {
  const s = snap({ dependencies: [{ workspace: "services/api", name: "nock", kind: "prod" }] });
  const found = noMockDependencies(s);
  expect(found).toHaveLength(1);
  expect(found[0].detail).toContain("nock");
});

test("flags a mock library declared as a dev dependency", () => {
  const s = snap({ dependencies: [{ workspace: "web", name: "msw", kind: "dev" }] });
  expect(noMockDependencies(s)).toHaveLength(1);
});

test("flags a mock call site in first-party source", () => {
  const s = snap({ files: [{ path: "web/src/page.ts", content: "vi.mock('./chain');" }] });
  const found = noMockCallSites(s);
  expect(found).toHaveLength(1);
  expect(found[0].where).toBe("web/src/page.ts");
});

test("flags a loopback url in committed source", () => {
  const s = snap({
    files: [
      { path: "caplane-workflow/config.staging.json", content: '{"url":"http://127.0.0.1:8787"}' },
    ],
  });
  expect(noLoopbackUrls(s)).toHaveLength(1);
});

test("flags the template mock server by filename", () => {
  const s = snap({ files: [{ path: "caplane-workflow/mock-server.js", content: "" }] });
  expect(noTemplateMockServer(s)).toHaveLength(1);
});

test("flags express reaching the workflow dependency graph", () => {
  const s = snap({
    dependencies: [{ workspace: "caplane-workflow", name: "express", kind: "prod" }],
  });
  expect(noTemplateMockServer(s)).toHaveLength(1);
});

test("accepts express in a service that legitimately serves http", () => {
  const s = snap({ dependencies: [{ workspace: "services/api", name: "express", kind: "prod" }] });
  expect(noTemplateMockServer(s)).toEqual([]);
});

test("flags a sprint reference in a tracked file", () => {
  const s = snap({ files: [{ path: "sdk/index.ts", content: "// see Sprint-03/05 for context" }] });
  expect(noSprintReferences(s)).toHaveLength(1);
});

test("flags a sprint reference in a commit message", () => {
  const s = snap({ commitMessages: ["feat: close Sprint-02/01"] });
  const found = noSprintReferences(s);
  expect(found).toHaveLength(1);
  expect(found[0].where).toBe("commit message");
});

test("flags a sprint reference in a branch name", () => {
  const s = snap({ refNames: ["feature/Sprint-03-workflow"] });
  expect(noSprintReferences(s)).toHaveLength(1);
});

test("flags planning frontmatter keys leaking into source", () => {
  const s = snap({ files: [{ path: "web/src/x.ts", content: "// estado: hecho-verificado" }] });
  expect(noSprintReferences(s)).toHaveLength(1);
});

test("accepts the ordinary english word sprint in prose", () => {
  const s = snap({
    files: [{ path: "sdk/index.ts", content: "// resolved in a two-week sprint" }],
    commitMessages: ["docs: describe the sprint planning workflow"],
  });
  expect(noSprintReferences(s)).toEqual([]);
});

test("flags spanish planning vocabulary in tracked source", () => {
  const s = snap({ files: [{ path: "sdk/index.ts", content: "// el gravamen ya existe" }] });
  const found = noPlanningVocabulary(s);
  expect(found).toHaveLength(1);
  expect(found[0].detail).toContain("gravamen");
});

test("accepts english source with no planning vocabulary", () => {
  const s = snap({ files: [{ path: "sdk/index.ts", content: "// the lien already exists" }] });
  expect(noPlanningVocabulary(s)).toEqual([]);
});

test("flags ConfidentialHTTPClient inside the workflow", () => {
  const s = snap({
    files: [{ path: "caplane-workflow/main.ts", content: "new ConfidentialHTTPClient()" }],
  });
  expect(noForbiddenCreIdentifiers(s)).toHaveLength(1);
});

test("flags vaultDonSecrets inside the workflow", () => {
  const s = snap({
    files: [{ path: "caplane-workflow/workflow.yaml", content: "vaultDonSecrets: true" }],
  });
  expect(noForbiddenCreIdentifiers(s)).toHaveLength(1);
});

test("flags a node-builtin dependency reaching the workflow", () => {
  const s = snap({
    dependencies: [{ workspace: "caplane-workflow", name: "ethers", kind: "prod" }],
  });
  const found = noForbiddenCreIdentifiers(s);
  expect(found).toHaveLength(1);
  expect(found[0].detail).toContain("ethers");
});

test("flags a tee region other than us-west-2", () => {
  const s = snap({
    files: [{ path: "caplane-workflow/main.ts", content: 'regions: ["eu-west-1"]' }],
  });
  expect(onlyApprovedTeeConstraint(s)).toHaveLength(1);
});

test("accepts the verified nitro us-west-2 constraint", () => {
  const s = snap({
    files: [
      { path: "caplane-workflow/main.ts", content: '[{ tee: "nitro", regions: ["us-west-2"] }]' },
    ],
  });
  expect(onlyApprovedTeeConstraint(s)).toEqual([]);
});

test("flags a tracked dotenv file", () => {
  const s = snap({ files: [{ path: ".env", content: "ARC_TESTNET_RPC_URL=https://x" }] });
  expect(noCommittedCredentials(s)).toHaveLength(1);
});

test("accepts .env.example", () => {
  const s = snap({ files: [{ path: ".env.example", content: "ARC_TESTNET_RPC_URL=" }] });
  expect(noCommittedCredentials(s)).toEqual([]);
});

test("flags a hardcoded private key assignment", () => {
  const s = snap({
    files: [
      {
        path: "contracts/script/Deploy.s.sol",
        content:
          "uint256 PRIVATE_KEY = 0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318;",
      },
    ],
  });
  expect(noCommittedCredentials(s)).toHaveLength(1);
});

test("accepts a 64-hex commitment in a test vector", () => {
  const s = snap({
    files: [
      {
        path: "claim/vectors.ts",
        content:
          'export const COMMITMENT = "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";',
      },
    ],
  });
  expect(noCommittedCredentials(s)).toEqual([]);
});

test("flags leftover template scaffolding by path", () => {
  const s = snap({ files: [{ path: ".cre/template.yaml", content: "projectDir: ." }] });
  expect(noTemplateScaffolding(s)).toHaveLength(1);
});

test("flags the template disclaimer block", () => {
  const s = snap({
    files: [{ path: "README.md", content: "This template is an educational example." }],
  });
  expect(noTemplateScaffolding(s)).toHaveLength(1);
});

test("flags a workflow directory still named my-workflow", () => {
  const s = snap({ files: [{ path: "my-workflow/main.ts", content: "" }] });
  expect(noTemplateScaffolding(s)).toHaveLength(1);
});

test("every rule is registered in ALL_RULES", () => {
  expect(ALL_RULES).toHaveLength(13);
});

test("does not flag the rule engine's own definitions and fixtures", () => {
  // Every rule engine contains the strings it detects, and every fixture contains the
  // violation it tests for. Scanning itself makes the gate permanently red.
  const s = snap({
    files: [
      { path: "scripts/hygiene/rules.ts", content: 'vi.mock( gravamen "eu-west-1" 127.0.0.1:8787' },
      { path: "scripts/hygiene/rules.test.ts", content: "This template is an educational example" },
    ],
  });
  expect(ALL_RULES.flatMap((rule) => rule(s))).toEqual([]);
});

test("still scans the rest of scripts/ — the exclusion stays narrow", () => {
  const s = snap({ files: [{ path: "scripts/test-count/count.ts", content: "vi.mock('./x')" }] });
  expect(noMockCallSites(s)).toHaveLength(1);
});

test("accepts a vendored copy identical to the canonical artifact", () => {
  const body = "export const registryAbi = [] as const satisfies Abi\n";
  const s = snap({
    files: [
      { path: "contracts/abi/index.ts", content: body },
      { path: "caplane-workflow/abi/index.ts", content: body },
    ],
  });
  expect(frozenArtifactsAreIdentical(s)).toEqual([]);
});

test("flags a vendored copy that drifted from the canonical artifact", () => {
  const s = snap({
    files: [
      { path: "contracts/abi/index.ts", content: "export const registryAbi = [1] as const\n" },
      { path: "caplane-workflow/abi/index.ts", content: "export const registryAbi = [] as const\n" },
    ],
  });
  const found = frozenArtifactsAreIdentical(s);
  expect(found).toHaveLength(1);
  expect(found[0].where).toBe("caplane-workflow/abi/index.ts");
});

test("accepts a repository with no vendored copies yet", () => {
  const s = snap({ files: [{ path: "contracts/abi/index.ts", content: "x" }] });
  expect(frozenArtifactsAreIdentical(s)).toEqual([]);
});

test("flags a copy whose canonical source is missing", () => {
  const s = snap({ files: [{ path: "sdk/src/abi/frozen.ts", content: "x" }] });
  const found = frozenArtifactsAreIdentical(s);
  expect(found).toHaveLength(1);
  expect(found[0].detail).toContain("no canonical");
});

test("flags a secret id that is not registered in .env.example", () => {
  const s = snap({
    files: [
      { path: ".env.example", content: "ARC_TESTNET_RPC_URL=\n" },
      {
        path: "caplane-workflow/workflow.ts",
        content: 'runtime.getSecrets([{ id: "GHOST_KEY" }])',
      },
    ],
  });
  const found = secretNamesAreRegistered(s);
  expect(found).toHaveLength(1);
  expect(found[0].detail).toContain("GHOST_KEY");
});

test("accepts a secret id that is registered", () => {
  const s = snap({
    files: [
      { path: ".env.example", content: "VAULT_ROUNDTRIP_PROBE=\n" },
      {
        path: "caplane-workflow/workflow.ts",
        content: 'runtime.getSecrets([{ id: "VAULT_ROUNDTRIP_PROBE" }])',
      },
    ],
  });
  expect(secretNamesAreRegistered(s)).toEqual([]);
});

test("flags an env var name that collides with its secret id", () => {
  const s = snap({
    files: [
      { path: "secrets.yaml", content: "secretsNames:\n  API_TOKEN:\n    - SECRET_API_TOKEN\n" },
    ],
  });
  const found = secretNamesAreRegistered(s);
  expect(found).toHaveLength(1);
  expect(found[0].detail).toContain("substring");
});

test("accepts non-overlapping secret id and env var names", () => {
  const s = snap({
    files: [
      {
        path: "secrets.yaml",
        content: "secretsNames:\n  VAULT_ROUNDTRIP_PROBE:\n    - CAPLANE_VAULT_PROBE_VALUE\n",
      },
    ],
  });
  expect(secretNamesAreRegistered(s)).toEqual([]);
});

// Five of the brand's eight checks are mechanical. A document saying "check there is no
// border radius before publishing" is an intention; a rule that fails the push is a guarantee.

test("flags a non-zero border radius", () => {
  const s = snap({ files: [{ path: "web/app/x.css", content: ".card{border-radius:4px}" }] });
  expect(brandInvariants(s)).toHaveLength(1);
});

test("accepts an explicit zero radius", () => {
  const s = snap({ files: [{ path: "web/app/x.css", content: ".card{border-radius:0}" }] });
  expect(brandInvariants(s)).toEqual([]);
});

test("flags a box shadow", () => {
  const s = snap({ files: [{ path: "web/app/x.css", content: ".card{box-shadow:0 1px 2px #000}" }] });
  expect(brandInvariants(s)).toHaveLength(1);
});

test("flags a round stroke linecap in any svg", () => {
  const s = snap({ files: [{ path: "brand/sprite.svg", content: 'stroke-linecap="round"' }] });
  expect(brandInvariants(s)).toHaveLength(1);
});

// The pair that matters: the seal hex is forbidden as text and correct as a fill.

test("flags the seal hex used as a text colour", () => {
  const s = snap({ files: [{ path: "web/app/x.css", content: ".tag{color:#A03328}" }] });
  const found = brandInvariants(s);
  expect(found).toHaveLength(1);
  expect(found[0]!.detail).toContain("--cp-seal-text");
});

test("accepts the seal hex as a fill", () => {
  const s = snap({ files: [{ path: "web/app/x.css", content: ".seal{background:#A03328}" }] });
  expect(brandInvariants(s)).toEqual([]);
});
