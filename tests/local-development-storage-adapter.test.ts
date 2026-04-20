import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocalDevelopmentStorageAdapter } from "../src/lib/storage/index.js";

const tempDirectories: string[] = [];

describe("LocalDevelopmentStorageAdapter", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map(async (directory) => {
        await import("node:fs/promises").then(({ rm }) =>
          rm(directory, { recursive: true, force: true })
        );
      })
    );
  });

  it("writes files to a local directory and returns a public URL", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "layu-storage-"));
    tempDirectories.push(rootDirectory);

    const adapter = new LocalDevelopmentStorageAdapter({
      rootDirectory,
      publicBaseUrl: "http://localhost:3000/uploads"
    });

    const storedAsset = await adapter.save({
      fileName: "Proof Image.PNG",
      contentType: "image/png",
      body: "stub-image"
    });

    const fileContents = await readFile(path.join(rootDirectory, storedAsset.key), "utf8");

    expect(storedAsset.publicUrl).toContain(storedAsset.key);
    expect(fileContents).toBe("stub-image");

    await adapter.remove(storedAsset.key);
  });
});
