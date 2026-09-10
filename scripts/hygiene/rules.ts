import type { Dependency, Finding, Snapshot, SourceFile } from "./scan";

const VENDORED = /(^|\/)(lib|node_modules|dist|out|cache|broadcast)\//;

// The rule engine and its fixtures necessarily contain every string the rules detect.
// Narrow on purpose: the rest of scripts/ is still scanned.
const RULE_ENGINE = /^scripts\/hygiene\//;

export const isVendored = (path: string) => VENDORED.test(path);

export const isScannable = (f: SourceFile) => !isVendored(f.path) && !RULE_ENGINE.test(f.path);

export const isFirstPartySource = (f: SourceFile) =>
  isScannable(f) && /\.(ts|tsx|js|jsx|mjs|cjs|sol|json|ya?ml|toml)$/.test(f.path);

const MOCK_LIBRARIES = new Set([
  "msw",
  "@mswjs/interceptors",
  "nock",
  "sinon",
  "testdouble",
  "fetch-mock",
  "miragejs",
  "mock-fs",
  "jest-mock",
]);

const MOCK_CALL_SITES = [
  "vi.mock(",
  "jest.mock(",
  "sinon.stub(",
  "sinon.mock(",
  "nock(",
  "setupServer(",
  "vm.mockCall",
  "vm.mockCallRevert",
];

const LOOPBACK = /\b(127\.0\.0\.1|0\.0\.0\.0|localhost):\d+/;

const WORKFLOW_DIR = "caplane-workflow";

export const noMockDependencies = (s: Snapshot): Finding[] =>
  s.dependencies
    .filter((d: Dependency) => MOCK_LIBRARIES.has(d.name))
    .map((d) => ({
      rule: "no-mock-dependencies",
      where: d.workspace || ".",
      detail: `${d.name} declared as ${d.kind} dependency`,
    }));

export const noMockCallSites = (s: Snapshot): Finding[] =>
  s.files.filter(isFirstPartySource).flatMap((f) =>
    MOCK_CALL_SITES.filter((needle) => f.content.includes(needle)).map((needle) => ({
      rule: "no-mock-call-sites",
      where: f.path,
      detail: needle,
    })),
  );

export const noLoopbackUrls = (s: Snapshot): Finding[] =>
  s.files
    .filter(isFirstPartySource)
    .filter((f) => LOOPBACK.test(f.content))
    .map((f) => ({
      rule: "no-loopback-urls",
      where: f.path,
      detail: f.content.match(LOOPBACK)![0],
    }));

export const noTemplateMockServer = (s: Snapshot): Finding[] => [
  ...s.files
    .filter(isScannable)
    .filter((f) => f.path.endsWith("mock-server.js"))
    .map((f) => ({
      rule: "no-template-mock-server",
      where: f.path,
      detail: "template mock server",
    })),
  ...s.dependencies
    .filter((d) => d.name === "express" && d.workspace.startsWith(WORKFLOW_DIR))
    .map((d) => ({
      rule: "no-template-mock-server",
      where: d.workspace,
      detail: "express reaches the workflow graph; the template ships it only for mock-server.js",
    })),
];

// Only shapes that are uniquely ours. Grepping the bare token "Sprint" would fire on
// ordinary English prose; these patterns cannot.
const SPRINT_SHAPES = [
  /Sprint-0[0-6]\b/,
  /\bSprint\//,
  /\bdepende_de:/,
  /\bsuperficie:\s*\[/,
  /\bhecho-verificado\b/,
  /\bestado:\s*(pendiente|en-progreso)\b/,
  /\bPROYECTO\.md\b/,
  /\bAUDITORIA-DE-COBERTURA\b/,
];

// The realistic leak is a pasted Spanish paragraph, not the word "Sprint".
const PLANNING_VOCABULARY = [
  "gravamen",
  "gravámenes",
  "financista",
  "pignoración",
  "sumisión",
  "veredicto",
  "hecho-verificado",
];

const matchShapes = (text: string) =>
  SPRINT_SHAPES.filter((re) => re.test(text)).map((re) => re.source);

export const noSprintReferences = (s: Snapshot): Finding[] => [
  ...s.files
    .filter(isFirstPartySource)
    .flatMap((f) =>
      matchShapes(f.content).map((detail) => ({
        rule: "no-sprint-references",
        where: f.path,
        detail,
      })),
    ),
  ...s.commitMessages.flatMap((m) =>
    matchShapes(m).map((detail) => ({
      rule: "no-sprint-references",
      where: "commit message",
      detail,
    })),
  ),
  ...s.refNames.flatMap((r) =>
    matchShapes(r).map((detail) => ({
      rule: "no-sprint-references",
      where: `ref ${r}`,
      detail,
    })),
  ),
];

export const noPlanningVocabulary = (s: Snapshot): Finding[] =>
  s.files.filter(isFirstPartySource).flatMap((f) =>
    PLANNING_VOCABULARY.filter((w) => f.content.toLowerCase().includes(w)).map((w) => ({
      rule: "no-planning-vocabulary",
      where: f.path,
      detail: `"${w}" — this repository is English only`,
    })),
  );

const FORBIDDEN_IN_WORKFLOW = ["ConfidentialHTTPClient", "vaultDonSecrets"];
const NODE_BUILTIN_PACKAGES = ["ethers", "axios", "node-fetch", "ws", "dotenv"];

const TEE_LITERAL = /\btee:\s*"([^"]+)"/g;
const REGIONS_LITERAL = /\bregions:\s*\[\s*"([^"]+)"/g;

// Deliberately narrow. A generic entropy scanner would fire on every commitment,
// keccak vector, forwarder address and transaction hash in evidence/.
const CREDENTIAL_ASSIGNMENT =
  /\b(PRIVATE_KEY|SECRET_KEY|API_KEY|API_TOKEN|MNEMONIC)\b\s*[:=]\s*"?0?x?[0-9a-fA-F]{32,}/;

const TEMPLATE_PATHS = [/^\.cre\//, /(^|\/)my-workflow\//, /(^|\/)hello-[a-z-]*workflow/];
const TEMPLATE_PHRASES = [
  "This template is an educational example",
  "Do not use this code in production",
];

export const noForbiddenCreIdentifiers = (s: Snapshot): Finding[] => [
  ...s.files
    .filter(isScannable)
    .filter((f) => f.path.startsWith(WORKFLOW_DIR))
    .flatMap((f) =>
      FORBIDDEN_IN_WORKFLOW.filter((id) => f.content.includes(id)).map((id) => ({
        rule: "no-forbidden-cre-identifiers",
        where: f.path,
        detail: `${id} is a must-pass rubric failure inside a TEE handler`,
      })),
    ),
  ...s.dependencies
    .filter((d) => d.workspace.startsWith(WORKFLOW_DIR) && NODE_BUILTIN_PACKAGES.includes(d.name))
    .map((d) => ({
      rule: "no-forbidden-cre-identifiers",
      where: d.workspace,
      detail: `${d.name} pulls Node builtins and cannot compile to WASM`,
    })),
];

export const onlyApprovedTeeConstraint = (s: Snapshot): Finding[] =>
  s.files.filter(isScannable).flatMap((f) => {
    const found: Finding[] = [];
    for (const [, tee] of f.content.matchAll(TEE_LITERAL)) {
      if (tee !== "nitro") {
        found.push({ rule: "approved-tee-constraint", where: f.path, detail: `tee: "${tee}"` });
      }
    }
    for (const [, region] of f.content.matchAll(REGIONS_LITERAL)) {
      if (region !== "us-west-2") {
        found.push({
          rule: "approved-tee-constraint",
          where: f.path,
          detail: `region "${region}"`,
        });
      }
    }
    return found;
  });

export const noCommittedCredentials = (s: Snapshot): Finding[] => [
  ...s.files
    .filter(isScannable)
    .filter((f) => /(^|\/)\.env($|\.)/.test(f.path) && !f.path.endsWith(".example"))
    .map((f) => ({
      rule: "no-committed-credentials",
      where: f.path,
      detail: "tracked dotenv file",
    })),
  ...s.files
    .filter(isScannable)
    .filter((f) => /\.(pem|p12|keystore)$/.test(f.path))
    .map((f) => ({ rule: "no-committed-credentials", where: f.path, detail: "key material" })),
  ...s.files
    .filter(isFirstPartySource)
    .filter((f) => CREDENTIAL_ASSIGNMENT.test(f.content))
    .map((f) => ({
      rule: "no-committed-credentials",
      where: f.path,
      detail: f.content.match(CREDENTIAL_ASSIGNMENT)![1],
    })),
];

export const noTemplateScaffolding = (s: Snapshot): Finding[] => [
  ...s.files
    .filter(isScannable)
    .filter((f) => TEMPLATE_PATHS.some((re) => re.test(f.path)))
    .map((f) => ({
      rule: "no-template-scaffolding",
      where: f.path,
      detail: "template scaffolding",
    })),
  ...s.files.filter(isScannable).flatMap((f) =>
    TEMPLATE_PHRASES.filter((phrase) => f.content.includes(phrase)).map((phrase) => ({
      rule: "no-template-scaffolding",
      where: f.path,
      detail: phrase,
    })),
  ),
];

const FROZEN_ARTIFACTS = ["index.ts", "frozen.ts"];
const CANONICAL_DIR = "contracts/abi/";

/**
 * With no workspace linkage every consumer holds a copy of the frozen interface. A stale copy
 * in the workflow fails OPEN: an obsolete selector makes the node return empty bytes, which
 * decodes to false, and the registry answers "not encumbered" while a double pledge is written.
 */
export const frozenArtifactsAreIdentical = (s: Snapshot): Finding[] => {
  const canonical = new Map<string, string>();
  for (const f of s.files) {
    if (!f.path.startsWith(CANONICAL_DIR)) continue;
    const name = f.path.slice(CANONICAL_DIR.length);
    if (FROZEN_ARTIFACTS.includes(name)) canonical.set(name, f.content);
  }

  return s.files
    .filter((f) => !f.path.startsWith(CANONICAL_DIR) && /(^|\/)abi\//.test(f.path))
    .filter((f) => FROZEN_ARTIFACTS.includes(f.path.split("/").pop()!))
    .flatMap((f) => {
      const name = f.path.split("/").pop()!;
      const source = canonical.get(name);
      if (source === undefined) {
        return [
          {
            rule: "frozen-artifact-drift",
            where: f.path,
            detail: `no canonical ${CANONICAL_DIR}${name}`,
          },
        ];
      }
      if (source === f.content) return [];
      return [
        {
          rule: "frozen-artifact-drift",
          where: f.path,
          detail: `differs from ${CANONICAL_DIR}${name}`,
        },
      ];
    });
};

export const ALL_RULES = [
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
];
