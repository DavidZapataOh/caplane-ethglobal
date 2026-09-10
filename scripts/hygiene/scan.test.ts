import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scan } from "./scan";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" });

const repo = () => {
  const root = mkdtempSync(join(tmpdir(), "hygiene-"));
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  return root;
};

test("scan reads commit messages and branch names, not just the worktree", async () => {
  const root = repo();
  writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
  git(root, "add", "-A");
  git(root, "commit", "-m", "chore: close Sprint-02/01");
  git(root, "branch", "feature/Sprint-03-workflow");

  const snap = await scan(root);

  expect(snap.files.map((f) => f.path)).toEqual(["a.ts"]);
  expect(snap.commitMessages.join("\n")).toContain("Sprint-02/01");
  expect(snap.refNames).toContain("feature/Sprint-03-workflow");
});

test("scan collects declared dependencies per directory", async () => {
  const root = repo();
  mkdirSync(join(root, "services", "api"), { recursive: true });
  writeFileSync(
    join(root, "services", "api", "package.json"),
    JSON.stringify({ dependencies: { nock: "13.0.0" }, devDependencies: { typescript: "5.9.3" } }),
  );
  git(root, "add", "-A");
  git(root, "commit", "-m", "chore: add service");

  const snap = await scan(root);

  expect(snap.dependencies).toContainEqual({ workspace: "services/api", name: "nock", kind: "prod" });
  expect(snap.dependencies).toContainEqual({ workspace: "services/api", name: "typescript", kind: "dev" });
});
