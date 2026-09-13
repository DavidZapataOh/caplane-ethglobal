import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";

/**
 * The evidence index is a map, and a map that points at a file nobody kept is worse than no map:
 * it sends a reader who is checking our work to a 404 and tells them what to conclude from that.
 *
 * These run in the hermetic hygiene job, so they gate a release without needing the network.
 */
const ROOT = new URL("../../evidence/", import.meta.url).pathname;
const INDEX = readFileSync(join(ROOT, "README.md"), "utf8");

const links = [...INDEX.matchAll(/\]\(([^)]+)\)/g)]
  .map((m) => m[1]!)
  .filter((href) => !href.startsWith("http"));

test("every link in the evidence index resolves", () => {
  expect(links.length).toBeGreaterThan(20);
  for (const href of links) {
    expect(existsSync(join(ROOT, href)), `${href} is linked and does not exist`).toBe(true);
  }
});

/**
 * A directory nobody indexed is a directory a reader never opens. Adding one and forgetting to
 * name it is the silent half of this failure — the loud half is a broken link, and only one of the
 * two would have been noticed.
 */
test("every evidence directory is named in the index", () => {
  const directories = readdirSync(ROOT).filter((entry) => statSync(join(ROOT, entry)).isDirectory());
  expect(directories.length).toBeGreaterThan(10);
  for (const directory of directories) {
    expect(INDEX.includes(`(${directory})`), `${directory}/ exists and the index never names it`).toBe(
      true,
    );
  }
});

/** The file count is a claim like any other, and it is the one that rots first. */
test("the file count the index states is the file count on disk", () => {
  const WORDS: Record<string, number> = {
    Ninety: 90,
    "Ninety-one": 91,
    "Ninety-two": 92,
    "Ninety-three": 93,
    "Ninety-four": 94,
    "Ninety-five": 95,
    "Ninety-six": 96,
    "Ninety-seven": 97,
    "Ninety-eight": 98,
    "Ninety-nine": 99,
    "One hundred": 100,
    "One hundred-one": 101,
    "One hundred-two": 102,
  };
  const stated = INDEX.match(/^([A-Z][a-z]+(?:[- ][a-z]+)?) files,/m)?.[1];
  expect(stated, "the index no longer opens with a file count").toBeDefined();
  expect(WORDS[stated!], `"${stated}" is not a number this test knows`).toBeDefined();

  const count = (directory: string): number =>
    readdirSync(directory).reduce((total, entry) => {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) return total + count(path);
      return entry === "README.md" && directory === ROOT ? total : total + 1;
    }, 0);

  expect(count(ROOT)).toBe(WORDS[stated!]);
});
