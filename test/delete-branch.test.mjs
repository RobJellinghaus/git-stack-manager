/**
 * What **Delete branch** removes, and what it refuses.
 *
 * The deletion itself is one ref update, so these tests cover the refusals and the recovery: which
 * branches the menu never removes, and how **Undo** brings back one that it did.
 *
 * `delete-merged.test.mjs` covers the sweep that removes every merged branch at once. This file
 * covers the single branch that a reader picks, merged or not.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { commitFile, run } from "../scripts/git-fixture.mjs";
import {
  branchShas,
  scratchRoot,
  shaOf,
  trunkRepository,
} from "./repoFixture.mjs";

/**
 * Trunk plus two branches off it, with HEAD back on trunk so both are deletable.
 *
 * @param {import("node:test").TestContext} t
 * @param {string} prefix
 */
function twoBranches(t, prefix) {
  const fixture = trunkRepository(t, prefix);
  const { repo } = fixture;
  for (const branch of ["feature", "spike"]) {
    run(repo, "git", ["switch", "-qc", branch, "main"]);
    commitFile(repo, `${branch}.txt`, `${branch}\n`, `${branch} work`);
  }
  run(repo, "git", ["switch", "-q", "main"]);
  return fixture;
}

test("the deletion removes the ref and its upstream config", async t => {
  const { repo, repository } = twoBranches(t, "gsm-delete-branch-");
  run(repo, "git", ["push", "-qu", "origin", "feature"]);

  const outcome = await repository.deleteBranch("feature");

  assert.equal(outcome.branch, "feature");
  assert.equal(branchShas(repo).has("feature"), false);
  // `config --get` exits 1 on an absent key, so the whole local config is what can be asserted.
  assert.equal(
    /^branch\.feature\./m.test(
      run(repo, "git", ["config", "--list", "--local"])
    ),
    false,
    "the config section went with the branch"
  );
  // The commit is still on the remote, so the reflog is not the only way back.
  assert.equal(outcome.onlyInReflog, false);
});

test("the outcome names the reflog when no other ref reaches the commit", async t => {
  const { repository } = twoBranches(t, "gsm-delete-branch-reflog-");

  const outcome = await repository.deleteBranch("spike");

  assert.equal(outcome.onlyInReflog, true);
});

test("Undo restores a deleted branch at the same commit", async t => {
  const { repo, repository } = twoBranches(t, "gsm-delete-branch-undo-");
  const before = shaOf(repo, "feature");

  await repository.undoable("Delete feature", () =>
    repository.deleteBranch("feature")
  );
  assert.equal(branchShas(repo).has("feature"), false);

  assert.equal(await repository.undo(), "Delete feature");
  assert.equal(shaOf(repo, "feature"), before);
});

test("the host refuses trunk, whichever commit it points at", async t => {
  const { repo, repository } = twoBranches(t, "gsm-delete-branch-trunk-");
  const before = branchShas(repo);

  await assert.rejects(
    () => repository.deleteBranch("main"),
    /main is the trunk that this tree measures every branch against/
  );

  assert.deepEqual(branchShas(repo), before);
});

test("the refusal for the checked-out branch names the way out", async t => {
  const { repo, repository } = twoBranches(t, "gsm-delete-branch-head-");
  run(repo, "git", ["switch", "-q", "feature"]);

  await assert.rejects(
    () => repository.deleteBranch("feature"),
    /you have feature checked out — Goto another commit first/
  );

  assert.equal(branchShas(repo).has("feature"), true);
});

test("the refusal for a branch that another worktree holds names the worktree", async t => {
  const { repo, repository } = twoBranches(t, "gsm-delete-branch-worktree-");
  const elsewhere = join(scratchRoot(t, "gsm-delete-branch-wt-"), "wt");
  run(repo, "git", ["worktree", "add", "-q", elsewhere, "feature"]);

  await assert.rejects(
    () => repository.deleteBranch("feature"),
    /another worktree holds feature/
  );

  assert.equal(branchShas(repo).has("feature"), true);
});

test("a branch that does not exist raises an error rather than passing silently", async t => {
  const { repository } = twoBranches(t, "gsm-delete-branch-absent-");

  await assert.rejects(
    () => repository.deleteBranch("never-existed"),
    /never-existed does not exist here/
  );
});
