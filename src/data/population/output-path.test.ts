import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { assertPopulationOutputPath } from "./output-path";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe("population output path", () => {
  it("requires a strict child of the work root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "population-work-"));
    directories.push(root);
    await mkdir(path.join(root, "nested"));
    expect(await assertPopulationOutputPath(path.join(root, "nested", "result"), root)).toBe(path.resolve(root, "nested", "result"));
    await expect(assertPopulationOutputPath(root, root)).rejects.toThrow(/strict child/);
    await expect(assertPopulationOutputPath(path.join(root, "..", "outside"), root)).rejects.toThrow(/strict child/);
  });

  it("allows a not-yet-created work root under the existing project", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "population-work-parent-"));
    directories.push(parent);
    const root = path.join(parent, "data", "work");
    expect(await assertPopulationOutputPath(path.join(root, "run"), root)).toBe(path.join(root, "run"));
  });

  it("rejects an output path reached through a symbolic link", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "population-work-"));
    const outside = await mkdtemp(path.join(tmpdir(), "population-outside-"));
    directories.push(root, outside);
    await symlink(outside, path.join(root, "linked"), "junction");
    await expect(assertPopulationOutputPath(path.join(root, "linked", "result"), root)).rejects.toThrow(/link|escapes/);
  });
});
