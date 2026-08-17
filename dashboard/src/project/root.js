import { dirname, join, resolve } from "node:path";
import { stat } from "node:fs/promises";

async function isDirectory(path) {
  try {
    const metadata = await stat(path);
    return metadata.isDirectory();
  } catch {
    return false;
  }
}

export async function findProjectRoot(startDirectory) {
  let candidate = resolve(startDirectory);

  while (true) {
    if (await isDirectory(join(candidate, ".codestable"))) {
      return candidate;
    }
    const parent = dirname(candidate);
    if (parent === candidate) return undefined;
    candidate = parent;
  }
}
