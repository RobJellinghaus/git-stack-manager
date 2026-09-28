/**
 * Which branch a `gh stack` command runs from.
 *
 * `gh stack rebase --upstack` starts from the checked-out branch, not from the branch named on
 * the command line, so a scoped rebase has to check its layer out first. A fake `gh` on PATH
 * records the branch HEAD was on when it ran, which is all these tests assert: the real CLI would
 * need a GitHub remote, and would rewrite the fixture besides.
 */
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { commitFile, run } from "../scripts/git-fixture.mjs";
import { stackBranches, trunkRepository } from "./repoFixture.mjs";

/**
 * A repository with three stacked layers, HEAD back on trunk, and `gh` shadowed by a script
 * that logs the branch it saw. Returns a reader for what that script recorded.
 *
 * @param {import("node:test").TestContext} t
 * @param {string} prefix
 */
function repositoryWithFakeGh(t, prefix) {
  const { repo, repository } = trunkRepository(t, prefix);
  stackBranches(repo, [
    { branch: "lower", file: "lower.txt", message: "lower work" },
    { branch: "middle", file: "middle.txt", message: "middle work" },
    { branch: "upper", file: "upper.txt", message: "upper work" },
  ]);
  run(repo, "git", ["switch", "-q", "main"]);

  const binDirectory = mkdtempSync(join(tmpdir(), "gsm-fake-gh-"));
  const logPath = join(binDirectory, "invocations");
  writeFileSync(
    join(binDirectory, "gh"),
    `#!/bin/sh\nprintf '%s %s\\n' "$(git rev-parse --abbrev-ref HEAD)" "$*" >> "${logPath}"\n`
  );
  chmodSync(join(binDirectory, "gh"), 0o755);

  // `spawnGh` passes no `env`, so the child inherits this process's PATH; restoring it keeps
  // the shadowing inside this test.
  const originalPath = process.env["PATH"];
  process.env["PATH"] = `${binDirectory}:${originalPath ?? ""}`;
  t.after(() => {
    process.env["PATH"] = originalPath;
  });

  return {
    repo,
    repository,
    /** Every `gh` call, as "<branch HEAD was on> <arguments>". */
    invocations: () => {
      try {
        return readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
      } catch {
        return [];
      }
    },
  };
}

test("a rebase scoped to one layer runs with that layer checked out", async t => {
  const { repo, repository, invocations } = repositoryWithFakeGh(
    t,
    "gsm-pivot-upstack-"
  );

  await repository.runGhStack({
    kind: "rebase",
    scope: "upstack",
    branch: "middle",
  });

  assert.deepEqual(invocations(), ["middle stack rebase middle --upstack"]);
  // HEAD stays on the layer, as it does after any `gh stack rebase`.
  assert.equal(
    run(repo, "git", ["rev-parse", "--abbrev-ref", "HEAD"]),
    "middle"
  );
});

test("a whole-stack rebase leaves HEAD where it was, since it has no starting layer", async t => {
  const { repo, repository, invocations } = repositoryWithFakeGh(
    t,
    "gsm-pivot-all-"
  );

  await repository.runGhStack({
    kind: "rebase",
    scope: "all",
    branch: "middle",
  });

  assert.deepEqual(invocations(), ["main stack rebase middle"]);
  assert.equal(run(repo, "git", ["rev-parse", "--abbrev-ref", "HEAD"]), "main");
});

test("a dirty working copy stops a scoped rebase before the checkout moves HEAD", async t => {
  const { repo, repository, invocations } = repositoryWithFakeGh(
    t,
    "gsm-pivot-dirty-"
  );
  writeFileSync(join(repo, "base.txt"), "edited\n");

  await assert.rejects(
    repository.runGhStack({
      kind: "rebase",
      scope: "upstack",
      branch: "middle",
    }),
    /uncommitted changes/
  );

  assert.deepEqual(invocations(), []);
  assert.equal(run(repo, "git", ["rev-parse", "--abbrev-ref", "HEAD"]), "main");
});

test("a rebase already on its layer runs without a second checkout", async t => {
  const { repo, repository, invocations } = repositoryWithFakeGh(
    t,
    "gsm-pivot-same-"
  );
  run(repo, "git", ["switch", "-q", "middle"]);
  // An uncommitted change is no obstacle when HEAD is already there: nothing has to move.
  commitFile(repo, "middle.txt", "more\n", "middle work, extended");
  writeFileSync(join(repo, "middle.txt"), "edited\n");

  await repository.runGhStack({
    kind: "rebase",
    scope: "upstack",
    branch: "middle",
  });

  assert.deepEqual(invocations(), ["middle stack rebase middle --upstack"]);
});
