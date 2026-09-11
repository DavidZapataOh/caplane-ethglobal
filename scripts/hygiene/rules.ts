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

const GET_SECRET_ID = /getSecrets?\(\s*\[?\s*\{\s*id:\s*["']([A-Z0-9_]+)["']/g;
const SECRETS_YAML_ENTRY = /^\s{2,}([A-Z0-9_]+):\s*$\n\s+-\s*([A-Z0-9_]+)\s*$/gm;

/**
 * One registry of secret names across four surfaces — local .env, GitHub Actions, the CRE Vault
 * and the platform env vars. Inconsistent names across files is rubric violation 10.
 * The substring ban is not style: the CLI fails to resolve overlapping id/env-var pairs.
 */
export const secretNamesAreRegistered = (s: Snapshot): Finding[] => {
  const envExample = s.files.find((f) => f.path.endsWith(".env.example"))?.content ?? "";
  const registered = new Set(
    envExample
      .split("\n")
      .map((l) => l.split("=")[0]!.trim())
      .filter(Boolean),
  );

  const findings: Finding[] = [];

  for (const f of s.files.filter(isFirstPartySource)) {
    for (const [, id] of f.content.matchAll(GET_SECRET_ID)) {
      if (!registered.has(id!)) {
        findings.push({
          rule: "secret-names-registered",
          where: f.path,
          detail: `${id} is not a key in .env.example`,
        });
      }
    }
  }

  const secretsYaml = s.files.find((f) => f.path.endsWith("secrets.yaml"))?.content ?? "";
  for (const [, id, envVar] of secretsYaml.matchAll(SECRETS_YAML_ENTRY)) {
    if (envVar!.includes(id!) || id!.includes(envVar!)) {
      findings.push({
        rule: "secret-names-registered",
        where: "secrets.yaml",
        detail: `${envVar} is a substring of ${id}; the CLI fails to resolve overlapping names`,
      });
    }
  }

  return findings;
};


/**
 * The mechanical half of the brand's checklist. Zero radius and no shadow are the two rules
 * that make the rest legible, and a rounded stroke gives the icon set away next to a square
 * card. The seal is the subtle one: the same hex is correct as a fill and fails contrast as
 * text on dark, which is why two tokens exist for it.
 */
export const brandInvariants = (s: Snapshot): Finding[] => {
  const findings: Finding[] = [];
  const flag = (where: string, detail: string) =>
    findings.push({ rule: "brand-invariants", where, detail });

  for (const f of s.files.filter(isScannable)) {
    for (const [, value] of f.content.matchAll(/border-radius:\s*([^;}"']+)/gi)) {
      if (!/^0[a-z%]*$/i.test(value!.trim())) flag(f.path, `border-radius: ${value!.trim()} — the brand is zero radius`);
    }
    for (const [, value] of f.content.matchAll(/box-shadow:\s*([^;}"']+)/gi)) {
      if (!/^none$/i.test(value!.trim())) flag(f.path, `box-shadow: ${value!.trim()} — the brand uses hairlines, never shadows`);
    }
    for (const [, property] of f.content.matchAll(/stroke-line(cap|join)\s*[:=]\s*"?round/gi)) {
      flag(f.path, `stroke-line${property} round — the set is butt and miter`);
    }
    // The seal as a text colour only. As a fill it is correct, which is the whole distinction.
    for (const [match] of f.content.matchAll(/(?:^|[^-\w])color:\s*#A03328/gi)) {
      flag(f.path, `${match.trim()} — use --cp-seal-text; the fill hex fails contrast as text on dark`);
    }
  }
  return findings;
};


/**
 * The public registry has to answer "is this claim already taken" by reading the chain, and it
 * has to keep answering when the backend is switched off. One project serves both the app and
 * the registry, so they share one environment: an API URL the app needs is present in the
 * registry's deployment whether or not anyone intended it. The guarantee therefore has to be a
 * property of the code path.
 */
const REGISTRY_ROUTE = /(^|\/)web\/app\/(\[[^\]]+\]\/)?registry\//;
const BACKEND_REFERENCE = /api\.caplane\.xyz|NEXT_PUBLIC_API_URL|CAPLANE_API_URL/;

export const registryReadsChainOnly = (s: Snapshot): Finding[] =>
  s.files
    .filter(isScannable)
    .filter((f) => REGISTRY_ROUTE.test(f.path) && BACKEND_REFERENCE.test(f.content))
    .map((f) => ({
      rule: "registry-reads-chain-only",
      where: f.path,
      detail: "the public registry must read the chain, never the backend — it has to survive the backend being switched off",
    }));


/**
 * The registry's core claim is checkable by reading the file: no owner, no pause, no upgrade.
 * A single inherited modifier would make it false while every test stayed green.
 */
const GOVERNANCE_SURFACE = [
  /\bonlyOwner\b/,
  /\bOwnable\b/,
  /\bAccessControl\b/,
  /\bPausable\b/,
  /\bUUPSUpgradeable\b/,
  /\bInitializable\b/,
  /\bselfdestruct\b/,
  /\bdelegatecall\b/,
];

export const contractsHaveNoGovernance = (s: Snapshot): Finding[] =>
  s.files
    .filter(isFirstPartySource)
    .filter((f) => f.path.startsWith("contracts/src/"))
    .flatMap((f) =>
      GOVERNANCE_SURFACE.filter((re) => re.test(f.content)).map((re) => ({
        rule: "contracts-have-no-governance",
        where: f.path,
        detail: `contracts/src must expose no ownership, pause, upgrade or delegatecall surface: ${re.source}`,
      })),
    );


/**
 * JavaScript the enclave cannot run, or runs differently.
 *
 * The SDK's own validator already refuses what throws loudly — node:crypto, fetch, setTimeout.
 * This covers what it does not: `Intl` is absent from the enclave and absent from the
 * validator, so it typechecks, compiles and throws where there is no stack to read; and the
 * locale-aware methods exist in both runtimes and return different bytes, which is worse
 * because nothing fails at all.
 *
 * Scoped to what is vendored into WASM. The lender SDK and the browser surfaces run where
 * `Intl` is correct and wanted.
 */
const VENDORED_INTO_WASM = /^(claim|caplane-workflow)\//;

const ENCLAVE_UNSAFE: Array<[RegExp, string]> = [
  [/\bIntl\b/, "Intl does not exist in the enclave, and neither the SDK's types nor its build validator catch it"],
  [/\.toLocale(Upper|Lower)Case\b/, "locale-blind in the enclave: use toUpperCase, or the commitment diverges with no error"],
  [/\.toLocaleString\b/, "formats differently in the two runtimes"],
  // The trailing guard rejects both an identifier and a quote: without the quote, a path
  // ending in `/v` inside an import reads as a flag list.
  [/\/[gimsuyd]*v[gimsuyd]*(?![\w$'"`])/, "the RegExp v flag throws in the enclave: use u"],
  [/new RegExp\([^)]*["'][gimsuyd]*v[gimsuyd]*["']\s*\)/, "the RegExp v flag throws in the enclave: use u"],
];

export const enclaveSafeJavaScript = (s: Snapshot): Finding[] =>
  s.files
    .filter(isScannable)
    .filter((f) => VENDORED_INTO_WASM.test(f.path))
    .flatMap((f) =>
      ENCLAVE_UNSAFE.filter(([pattern]) => pattern.test(f.content)).map(([, detail]) => ({
        rule: "enclave-safe-javascript",
        where: f.path,
        detail,
      })),
    );

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
  secretNamesAreRegistered,
  brandInvariants,
  registryReadsChainOnly,
  enclaveSafeJavaScript,
  contractsHaveNoGovernance,
];
