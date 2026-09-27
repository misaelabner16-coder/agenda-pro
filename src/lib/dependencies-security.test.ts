import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Next dependency stays outside the audited ImageResponse vulnerable range", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const version = manifest.dependencies.next;
  assert.match(version, /^\d+\.\d+\.\d+$/); // Exact version, reviewed with its lockfile.
  const [major, minor, patch] = version.split(".").map(Number);
  assert.ok(major > 16 || (major === 16 && (minor > 3 || (minor === 3 && patch >= 6))));
  assert.equal(manifest.devDependencies["eslint-config-next"], version);
});
