/**
 * What a rebase leaves behind in `.git/gh-stack`.
 *
 * `Repository.recordStackBases` repairs the record after every rebase that moves a layer. Only the
 * real CLI can show that the repair worked, since the claim is that `gh stack`'s own verdict comes
 * back clean and a fake `gh` would confirm whatever it was told to say. That test skips where the
 * public-preview extension is absent. The toast's fallback sentence is checked here too, as the
 * other half of the same outcome.
 *
 * Trunk here is the local `main`, with nothing pushed. A rebase onto a remote-tracking trunk
 * fetches first, and this fixture's remote is a GitHub URL that must never be contacted.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { Repository } from "#app/repository";
import { readGhStacks } from "#github/ghStack";
import {
  commitFile,
  initRepoWithOrigin,
  OTHER,
  run,
} from "../scripts/git-fixture.mjs";
import { staleStackNote } from "../src/webview/model/rebaseReport.mts";
import {
  branchShas,
  ghStackAvailable,
  scratchRoot,
  shaOf,
  stackBranches,
} from "./repoFixture.mjs";

const LAYERS = ["lower", "middle", "upper"];

/**
 * Three layers registered with `gh stack init`, trunk one commit ahead of the fork point, and
 * HEAD back on trunk — the state a reader is in when they right-click the bottom commit and
 * rebase onto trunk.
 *
 * @param {import("node:test").TestContext} t
 */
function stackNeedingRebase(t) {
  const root = scratchRoot(t, "gsm-ghstack-record-");
  const { repo } = initRepoWithOrigin(root);
  commitFile(repo, "base.txt", "base\n", "initial", OTHER);
  // `gh stack init` needs a GitHub remote to name the stack after; the URL is never contacted.
  run(repo, "git", [
    "remote",
    "set-url",
    "origin",
    "https://github.com/example/example.git",
  ]);
  stackBranches(
    repo,
    LAYERS.map(branch => ({
      branch,
      file: `${branch}.txt`,
      message: `${branch} work`,
    }))
  );
  execFileSync("gh", ["stack", "init", ...LAYERS], {
    cwd: repo,
    stdio: "ignore",
  });

  run(repo, "git", ["switch", "-q", "main"]);
  commitFile(repo, "other.txt", "other\n", "upstream work", OTHER);
  return { repo, repository: new Repository(repo) };
}

/**
 * What `gh stack view --json` says about each layer, in stack order.
 *
 * @param {string} repo
 */
function reportedNeedsRebase(repo) {
  const view =
    /** @type {{ branches: { name: string, needsRebase: boolean }[] }} */ (
      JSON.parse(
        execFileSync("gh", ["stack", "view", "--json"], {
          cwd: repo,
          encoding: "utf8",
        })
      )
    );
  const verdicts = new Map(
    view.branches.map(branch => [branch.name, branch.needsRebase])
  );
  return LAYERS.map(name => verdicts.get(name));
}

test(
  "a rebase onto trunk leaves gh stack reporting no layer behind",
  { skip: ghStackAvailable() ? false : "gh stack extension not installed" },
  async t => {
    const { repo, repository } = stackNeedingRebase(t);
    assert.deepEqual(
      reportedNeedsRebase(repo),
      [true, false, false],
      "the bottom layer starts behind trunk, which is what the rebase is for"
    );

    const outcome = await repository.rebase(shaOf(repo, "lower"), {
      kind: "trunk",
    });

    assert.equal(outcome.conflict, false);
    assert.deepEqual(outcome.moved, LAYERS);
    assert.equal(
      outcome.staleStacks,
      undefined,
      "no repair is owed when the re-record landed"
    );
    // The reader rebased from trunk, and the re-record runs from wherever they were.
    assert.equal(
      run(repo, "git", ["rev-parse", "--abbrev-ref", "HEAD"]),
      "main"
    );

    assert.deepEqual(reportedNeedsRebase(repo), [false, false, false]);
    // What that verdict rests on: every recorded base is the tip of the layer below, and the
    // bottom layer's is the trunk commit the rebase moved it onto.
    const shas = branchShas(repo);
    assert.deepEqual(
      readGhStacks(join(repo, ".git"))[0]?.branches.map(entry => entry.base),
      [shas.get("main"), shas.get("lower"), shas.get("middle")]
    );
  }
);

test("the toast names the repair command per stack left stale", () => {
  assert.equal(staleStackNote(undefined), "");
  assert.equal(staleStackNote([]), "");
  // Every rebase surface appends this, so it reads as a clause rather than a sentence, and stays
  // copy-pasteable: the reader is the one who runs it.
  assert.equal(
    staleStackNote(["lower"]),
    " — gh stack still records the old bases: run `gh stack rebase lower --no-trunk`"
  );
  assert.equal(
    staleStackNote(["lower", "other"]),
    " — gh stack still records the old bases: run `gh stack rebase lower --no-trunk`; `gh stack rebase other --no-trunk`"
  );
});
