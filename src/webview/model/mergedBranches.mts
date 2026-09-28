/**
 * What *Clear merged* says before and after it runs.
 *
 * The host decides which branches can go and phrases why the rest stay (`keptReason` in
 * `pruneMerged.ts`); these functions only arrange those sentences. Kept branches are named in
 * both places on purpose: the tooltip answers "why is a merged branch still here?" without
 * touching the repository, and the toast answers the same question for the state the click
 * found, which a forced pull request fetch can have changed.
 *
 * Separate from the button so the wording is assertable without rendering a tree.
 */
import type { MergedBranch } from "#history/pruneMerged";

export function deletableMerged(merged: MergedBranch[]): MergedBranch[] {
  return merged.filter(branch => !branch.keptReason);
}

/** `name: reason`, joined so one line can carry several branches. */
function listKept(kept: MergedBranch[]): string {
  return kept.map(branch => `${branch.name}: ${branch.keptReason}`).join("; ");
}

function branchCount(count: number): string {
  return count === 1 ? "branch" : "branches";
}

/**
 * The button's tooltip: what pressing it does, then the branches it would take, then every
 * branch it would leave and why.
 *
 * Newlines rather than one sentence, because the kept reasons are a list and a reader scanning
 * for their own branch name should not have to parse prose to find it.
 */
export function describeClearMerged(merged: MergedBranch[]): string {
  const deletable = deletableMerged(merged);
  const kept = merged.filter(branch => branch.keptReason);
  const lines = [
    "Re-read pull request status, then delete every local branch sitting at the commit its pull request merged. Undo brings one back.",
  ];
  if (deletable.length) {
    lines.push(`Ready: ${deletable.map(branch => branch.name).join(", ")}.`);
  }
  if (kept.length) {
    lines.push(`Kept — ${listKept(kept)}.`);
  }
  return lines.join("\n");
}

/**
 * The toast after a sweep: what went, and what stayed with its reason.
 *
 * A sweep that deletes nothing still reports, because the reader pressed a button and silence
 * would read as a failure.
 */
export function describeMergedDeletion(
  deleted: string[],
  kept: MergedBranch[]
): string {
  const went = deleted.length
    ? `Deleted merged ${branchCount(deleted.length)} ${deleted.join(", ")} ✓`
    : "";
  const stayed = kept.length ? `Kept ${listKept(kept)}` : "";
  if (went && stayed) {
    return `${went} — ${stayed}`;
  }
  if (went || stayed) {
    return went || stayed;
  }
  return "No branch in the tree has a merged pull request.";
}
