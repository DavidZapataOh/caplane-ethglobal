import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export type Finding = { rule: string; where: string; detail: string };
export type SourceFile = { path: string; content: string };
export type Dependency = { workspace: string; name: string; kind: "prod" | "dev" };
export type Snapshot = {
  files: SourceFile[];
  commitMessages: string[];
  refNames: string[];
  dependencies: Dependency[];
};

// css and svg are here because rules target them: the brand invariants live in stylesheets
// and the icon spec lives in the sprite. Without them those rules pass their own fixtures and
// see nothing in the repository.
const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|sol|json|ya?ml|toml|sh|md|css|svg)$|(^|\/)\.env(\.|$)/;

const git = async (root: string, args: string[]) =>
  (await run("git", args, { cwd: root, maxBuffer: 64 * 1024 * 1024 })).stdout;

export async function scan(root: string): Promise<Snapshot> {
  const tracked = (await git(root, ["ls-files"])).split("\n").filter(Boolean);

  const files: SourceFile[] = [];
  for (const path of tracked) {
    if (!TEXT.test(path)) continue;
    // A tracked file can be absent from the working tree — deleted but not yet staged. The
    // gate should report on what is there, not crash on what is not.
    let content: string;
    try {
      content = await readFile(join(root, path), "utf8");
    } catch {
      continue;
    }
    files.push({ path, content });
  }

  const commitMessages = (await git(root, ["log", "--format=%B", "--all"]))
    .split("\n\n")
    .map((m) => m.trim())
    .filter(Boolean);

  const refNames = (await git(root, ["for-each-ref", "--format=%(refname:short)"]))
    .split("\n")
    .filter(Boolean);

  const dependencies: Dependency[] = [];
  for (const f of files) {
    if (!f.path.endsWith("package.json")) continue;
    const workspace = dirname(f.path) === "." ? "" : dirname(f.path);
    const pkg = JSON.parse(f.content) as Record<string, Record<string, string>>;
    for (const [field, kind] of [
      ["dependencies", "prod"],
      ["devDependencies", "dev"],
    ] as const) {
      for (const name of Object.keys(pkg[field] ?? {})) {
        dependencies.push({ workspace, name, kind });
      }
    }
  }

  return { files, commitMessages, refNames, dependencies };
}
