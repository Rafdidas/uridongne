import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function nearestExisting(target: string): Promise<string> {
  let current = path.resolve(target);
  while (true) {
    try { await lstat(current); return current; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

async function rejectLinkSegments(root: string, target: string): Promise<void> {
  let current = root;
  while (true) {
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error("population output path cannot contain a symbolic link");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (current === target) return;
    current = path.join(current, path.relative(current, target).split(path.sep)[0]);
  }
}

export async function assertPopulationOutputPath(outputDir: string, workRoot: string): Promise<string> {
  const root = path.resolve(workRoot);
  const target = path.resolve(outputDir);
  if (!inside(root, target)) throw new Error("population output must be a strict child of work root");
  await rejectLinkSegments(root, target);
  const [rootReal, existingReal] = await Promise.all([realpath(await nearestExisting(root)), realpath(await nearestExisting(target))]);
  if (existingReal !== rootReal && !inside(rootReal, existingReal)) throw new Error("population output parent escapes work root");
  return target;
}
