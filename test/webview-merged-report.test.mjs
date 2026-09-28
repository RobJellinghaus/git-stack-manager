/**
 * What *Clear merged* says before and after it runs.
 *
 * The button's whole point is the reason a merged branch stayed, so the wording is the
 * feature rather than decoration around it. These functions take the host's branch list as an
 * argument and return a string, which is what makes the exact sentence assertable without
 * rendering a top bar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deletableMerged,
  describeClearMerged,
  describeMergedDeletion,
} from "../src/webview/model/mergedBranches.mts";

/**
 * @param {string} name
 * @param {string | null} keptReason
 */
function branch(name, keptReason) {
  return { name, sha: `${name}-sha`, keptReason };
}

test("only branches with no reason count as ready", () => {
  const merged = [
    branch("ready", null),
    branch("held", "you have it checked out — check out trunk first"),
  ];
  assert.deepEqual(
    deletableMerged(merged).map(each => each.name),
    ["ready"]
  );
});

test("the tooltip names what would go and what would stay", () => {
  const tooltip = describeClearMerged([
    branch("fix-slug", null),
    branch("add-words", null),
    branch("amended", "it holds commits its pull request never had"),
  ]);
  const lines = tooltip.split("\n");
  assert.match(lines[0], /^Re-read pull request status, then delete/);
  assert.equal(lines[1], "Ready: fix-slug, add-words.");
  assert.equal(
    lines[2],
    "Kept — amended: it holds commits its pull request never had."
  );
});

test("the tooltip drops the half it has nothing to say about", () => {
  const nothingReady = describeClearMerged([
    branch("held", "another worktree holds it (/tmp/wt)"),
  ]);
  assert.equal(nothingReady.includes("Ready:"), false);
  assert.match(nothingReady, /Kept — held: another worktree holds it/);

  const nothingKept = describeClearMerged([branch("ready", null)]);
  assert.equal(nothingKept.includes("Kept"), false);
  assert.match(nothingKept, /Ready: ready\./);
});

test("the toast reports both halves of a sweep in one line", () => {
  assert.equal(
    describeMergedDeletion(["a", "b"], [branch("c", "a rebase is stopped")]),
    "Deleted merged branches a, b ✓ — Kept c: a rebase is stopped"
  );
  // Singular, because "1 branches" is the detail that makes a report read as generated.
  assert.equal(describeMergedDeletion(["a"], []), "Deleted merged branch a ✓");
  assert.equal(
    describeMergedDeletion([], [branch("c", "you have it checked out")]),
    "Kept c: you have it checked out"
  );
});

test("a sweep with nothing to do still says so", () => {
  // The reader pressed a button; silence would read as a failed action.
  assert.equal(
    describeMergedDeletion([], []),
    "No branch in the tree has a merged pull request."
  );
});
