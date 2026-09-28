/**
 * `gh stack` state reading.
 *
 * `.git/gh-stack` is an implementation detail of a public-preview extension, so these
 * tests pin the two things that protect against it changing: the schema version check, and
 * that the derived "needs rebase" verdict matches what `gh stack view --json` reports. The
 * comparison against the real CLI is skipped when `gh stack` is not installed, so the suite
 * still runs anywhere.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  ghStackArguments,
  indexStackMembership,
  readGhStacks,
  stacksHolding,
} from "#github/ghStack";
import {
  commitFile,
  initRepoWithOrigin,
  run,
} from "../scripts/git-fixture.mjs";
import { branchShas, ghStackAvailable, scratchRoot } from "./repoFixture.mjs";

/**
 * A repository with one commit and no stack state, so `.git` is somewhere to write one.
 *
 * @param {import("node:test").TestContext} t
 * @param {string} [prefix]
 */
function scratchRepository(t, prefix = "gsm-ghstack-") {
  const root = scratchRoot(t, prefix);
  const { repo } = initRepoWithOrigin(root);
  commitFile(repo, "f.txt", "base\n", "initial");
  return { repo, gitDirectory: join(repo, ".git") };
}

/**
 * The parents the reader hands `indexStackMembership`: every local commit, bounded at trunk,
 * which is what `walkLocalCommits` produces.
 *
 * @param {string} repo
 * @param {string} trunk
 */
function localParents(repo, trunk) {
  const log = run(repo, "git", [
    "log",
    "--format=%H %P",
    "--branches",
    "--not",
    trunk,
  ]);
  return new Map(
    log
      .split("\n")
      .filter(Boolean)
      .map(line => {
        const [sha = "", ...parents] = line.trim().split(" ");
        return [sha, parents.filter(Boolean)];
      })
  );
}

/**
 * Write a `.git/gh-stack` state file with the given contents.
 *
 * @param {string} gitDirectory
 * @param {unknown} state
 */
function writeState(gitDirectory, state) {
  writeFileSync(join(gitDirectory, "gh-stack"), JSON.stringify(state));
}

test("an unknown schema version yields no stacks rather than a guess", t => {
  const { gitDirectory } = scratchRepository(t);
  // A future `gh stack` may reshape the file. Reporting nothing loses badges;
  // guessing at the new shape would show wrong ones.
  writeState(gitDirectory, {
    schemaVersion: 99,
    stacks: [
      {
        trunk: { branch: "main", head: "a" },
        branches: [{ branch: "x", base: "a" }],
      },
    ],
  });
  assert.deepEqual(readGhStacks(gitDirectory), []);
});

test("malformed state is ignored instead of throwing", t => {
  const { gitDirectory } = scratchRepository(t);
  writeFileSync(join(gitDirectory, "gh-stack"), "{ truncated");
  assert.deepEqual(readGhStacks(gitDirectory), []);

  // A stack with no usable branches carries no information.
  writeState(gitDirectory, {
    schemaVersion: 1,
    stacks: [{ branches: [{ nope: true }] }],
  });
  assert.deepEqual(readGhStacks(gitDirectory), []);
});

test("no state file at all is the common case, not an error", t => {
  const { gitDirectory } = scratchRepository(t);
  assert.deepEqual(readGhStacks(gitDirectory), []);
});

test("membership reports each branch's layer and flags a drifted base", () => {
  const stacks = [
    {
      trunkBranch: "main",
      trunkHead: "trunk-sha",
      branches: [
        { branch: "lower", base: "trunk-sha" },
        { branch: "upper", base: "lower-old-sha" },
      ],
    },
  ];
  // `lower` has moved since `upper` recorded its base, which is what an amend or
  // rebase of the lower layer looks like.
  const membership = indexStackMembership(
    stacks,
    new Map([
      ["lower", "lower-new-sha"],
      ["upper", "upper-sha"],
    ])
  );
  assert.deepEqual(membership.get("lower"), {
    position: 1,
    branches: ["lower", "upper"],
    needsRebase: false,
    recordedBaseStale: false,
  });
  assert.deepEqual(membership.get("upper"), {
    position: 2,
    branches: ["lower", "upper"],
    needsRebase: true,
    recordedBaseStale: true,
  });
});

test("a rebase that carried the whole stack leaves no layer needing one", () => {
  const stacks = [
    {
      trunkBranch: "main",
      trunkHead: "trunk-old",
      branches: [
        { branch: "lower", base: "trunk-old" },
        { branch: "middle", base: "lower-old" },
        { branch: "upper", base: "middle-old" },
      ],
    },
  ];
  const shaOfBranch = new Map([
    ["main", "trunk-new"],
    ["lower", "lower-new"],
    ["middle", "middle-new"],
    ["upper", "upper-new"],
  ]);
  // The parents the reader's walk hands over. It stops at trunk, so `trunk-new` appears as a
  // parent and never as a key — which is still enough to place the bottom layer.
  const parents = new Map([
    ["lower-new", ["trunk-new"]],
    ["middle-new", ["lower-new"]],
    ["upper-new", ["middle-new"]],
  ]);

  const membership = indexStackMembership(stacks, shaOfBranch, parents);
  for (const branch of ["lower", "middle", "upper"]) {
    assert.equal(
      membership.get(branch)?.needsRebase,
      false,
      `${branch} sits on the layer below, which is all a rebase owes it`
    );
    assert.equal(membership.get(branch)?.recordedBaseStale, true);
  }
  // Told nothing of the parents, the recorded shas are the only evidence, and every one of them
  // names a replaced commit. `Repository.readStackState` relies on that reading after a re-record.
  assert.equal(
    indexStackMembership(stacks, shaOfBranch).get("middle")?.needsRebase,
    true
  );
});

test("a layer left behind by an amend needs a rebase", () => {
  const stacks = [
    {
      trunkBranch: "main",
      trunkHead: "trunk",
      branches: [
        { branch: "lower", base: "trunk" },
        { branch: "middle", base: "lower-old" },
        { branch: "upper", base: "middle" },
      ],
    },
  ];
  const shaOfBranch = new Map([
    ["main", "trunk"],
    ["lower", "lower-new"],
    ["middle", "middle-sha"],
    ["upper", "upper-sha"],
  ]);
  // `middle` still hangs off the pre-amend `lower`, which the walk still reaches, so `contains`
  // settles this one rather than the recorded sha.
  const parents = new Map([
    ["lower-new", ["trunk"]],
    ["lower-old", ["trunk"]],
    ["middle-sha", ["lower-old"]],
    ["upper-sha", ["middle-sha"]],
  ]);

  const membership = indexStackMembership(stacks, shaOfBranch, parents);
  assert.deepEqual(
    ["lower", "middle", "upper"].map(
      branch => membership.get(branch)?.needsRebase
    ),
    [false, true, false],
    "only the layer directly above the amended one is off its base"
  );
});

test("only the stacks a rebase moved are selected for re-recording", () => {
  const stacks = [
    {
      trunkBranch: "main",
      trunkHead: "trunk-sha",
      branches: [
        { branch: "lower", base: "trunk-sha" },
        { branch: "upper", base: "lower-sha" },
      ],
    },
    {
      trunkBranch: "main",
      trunkHead: "trunk-sha",
      branches: [{ branch: "solo", base: "trunk-sha" }],
    },
  ];
  assert.deepEqual(stacksHolding(stacks, ["upper", "main"]), [stacks[0]]);
  // A stack the rebase never touched is left alone even when its record is stale for some
  // other reason: re-recording it would replay commits the reader did not ask about.
  assert.deepEqual(stacksHolding(stacks, ["lower", "solo"]), stacks);
  assert.deepEqual(stacksHolding(stacks, []), []);
});

test("command arguments match the documented gh stack flags", () => {
  assert.deepEqual(ghStackArguments({ kind: "submit" }), ["stack", "submit"]);
  assert.deepEqual(ghStackArguments({ kind: "push" }), ["stack", "push"]);
  assert.deepEqual(ghStackArguments({ kind: "sync", prune: true }), [
    "stack",
    "sync",
    "--prune",
  ]);
  assert.deepEqual(ghStackArguments({ kind: "sync", prune: false }), [
    "stack",
    "sync",
  ]);
  assert.deepEqual(ghStackArguments({ kind: "rebase", scope: "all" }), [
    "stack",
    "rebase",
  ]);
  assert.deepEqual(ghStackArguments({ kind: "rebase", scope: "upstack" }), [
    "stack",
    "rebase",
    "--upstack",
  ]);
  assert.deepEqual(ghStackArguments({ kind: "rebase", scope: "downstack" }), [
    "stack",
    "rebase",
    "--downstack",
  ]);
});

test("a rebase names the clicked layer, so the stack is chosen without a checkout", () => {
  assert.deepEqual(
    ghStackArguments({ kind: "rebase", scope: "all", branch: "lower" }),
    ["stack", "rebase", "lower"]
  );
  assert.deepEqual(
    ghStackArguments({ kind: "rebase", scope: "upstack", branch: "middle" }),
    ["stack", "rebase", "middle", "--upstack"]
  );
  assert.deepEqual(
    ghStackArguments({ kind: "rebase", scope: "downstack", branch: "upper" }),
    ["stack", "rebase", "upper", "--downstack"]
  );
});

test("re-recording the bases holds the layers still with --no-trunk", () => {
  // The form `Repository` runs after its own rebase: every layer already sits where it belongs,
  // leaving only the bases to write. Without the flag the same command fetches trunk and replays
  // the bottom layer onto it, undoing the placement the rebase just made.
  assert.deepEqual(
    ghStackArguments({
      kind: "rebase",
      scope: "all",
      branch: "lower",
      noTrunk: true,
    }),
    ["stack", "rebase", "lower", "--no-trunk"]
  );
});

test(
  "the derived needsRebase verdict agrees with `gh stack view --json`",
  { skip: ghStackAvailable() ? false : "gh stack extension not installed" },
  t => {
    const { repo } = scratchRepository(t, "gsm-ghstack-live-");
    // `gh stack init` needs a GitHub remote to name the stack after; the URL is
    // never contacted.
    run(repo, "git", [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/example.git",
    ]);
    run(repo, "git", ["switch", "-qc", "lower"]);
    commitFile(repo, "lower.txt", "lower\n", "lower work");
    run(repo, "git", ["switch", "-qc", "upper"]);
    commitFile(repo, "upper.txt", "upper\n", "upper work");
    execFileSync("gh", ["stack", "init", "lower", "upper"], {
      cwd: repo,
      stdio: "ignore",
    });

    // Amending the lower layer is what makes the upper one stale.
    run(repo, "git", ["switch", "-q", "lower"]);
    run(repo, "git", [
      "commit",
      "-q",
      "--amend",
      "--no-edit",
      "-m",
      "lower work, amended",
    ]);

    const reported = JSON.parse(
      execFileSync("gh", ["stack", "view", "--json"], {
        cwd: repo,
        encoding: "utf8",
      })
    );
    const derived = indexStackMembership(
      readGhStacks(join(repo, ".git")),
      branchShas(repo),
      localParents(repo, "main")
    );

    for (const branch of reported.branches) {
      assert.equal(
        derived.get(branch.name)?.needsRebase,
        branch.needsRebase,
        `needsRebase for ${branch.name} must match gh stack's own verdict`
      );
    }
  }
);

test(
  "the verdict still agrees once a rebase has moved every layer",
  { skip: ghStackAvailable() ? false : "gh stack extension not installed" },
  t => {
    const layers = ["lower", "middle", "upper"];
    const { repo } = scratchRepository(t, "gsm-ghstack-rebased-");
    run(repo, "git", [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/example.git",
    ]);
    for (const branch of layers) {
      run(repo, "git", ["switch", "-qc", branch]);
      commitFile(repo, `${branch}.txt`, `${branch}\n`, `${branch} work`);
    }
    execFileSync("gh", ["stack", "init", ...layers], {
      cwd: repo,
      stdio: "ignore",
    });

    // Trunk moves, then one `git rebase --update-refs` carries all three layers onto it. No
    // `gh` runs, so the record still names every commit the rebase replaced — what a rebase
    // driven from the terminal leaves, and what the panel left before it re-recorded.
    run(repo, "git", ["switch", "-q", "main"]);
    commitFile(repo, "other.txt", "other\n", "upstream work");
    run(repo, "git", ["switch", "-q", "upper"]);
    run(repo, "git", ["rebase", "--update-refs", "main"]);

    const stacks = readGhStacks(join(repo, ".git"));
    const shaOfBranch = branchShas(repo);
    assert.deepEqual(
      layers.map(
        branch =>
          indexStackMembership(stacks, shaOfBranch).get(branch)
            ?.recordedBaseStale
      ),
      [true, true, true],
      "the rebase left every recorded base naming a commit that is gone"
    );

    const derived = indexStackMembership(
      stacks,
      shaOfBranch,
      localParents(repo, "main")
    );
    const reported = JSON.parse(
      execFileSync("gh", ["stack", "view", "--json"], {
        cwd: repo,
        encoding: "utf8",
      })
    );
    for (const branch of reported.branches) {
      assert.equal(
        derived.get(branch.name)?.needsRebase,
        branch.needsRebase,
        `needsRebase for ${branch.name} must match gh stack's own verdict`
      );
    }
    // Pinned as well as compared, so a derivation that went wrong in the same direction as
    // `gh stack` cannot pass the loop above.
    assert.deepEqual(
      layers.map(branch => derived.get(branch)?.needsRebase),
      [false, false, false]
    );
  }
);
