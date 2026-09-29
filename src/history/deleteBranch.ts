/**
 * deleteBranch — remove one local branch, leaving its commits where they are.
 *
 * A deletion takes the branch's commits out of the tree and leaves the commits themselves in the
 * object store, reachable from the reflog. **Undo** recreates the branch, because undo restores the
 * refs that a mutation moved. That recovery is why the menu entry asks for no confirmation, and why
 * it draws no `-d`/`-D` distinction: git's `-d` guards against an unmerged branch; that case is
 * recoverable here, so the toast reports it rather than refusing the click.
 *
 * `update-ref` names the sha that the snapshot read, so a branch that gained a commit between the
 * snapshot and the click keeps that commit rather than losing it to a stale view of the tree.
 * `pruneMerged` applies the same guard to a whole batch.
 *
 * The refusals cover what a second click cannot fix. The tree measures every distance on screen
 * against trunk, and git refuses to delete a branch that another worktree has checked out.
 */
import { GitError, GitRunner } from "#git/runner";
import { RawData } from "#git/snapshot";

const COMMAND = "delete branch";

export type BranchDeletion = {
  branch: string;
  sha: string;
  /**
   * No other branch, remote-tracking ref, or tag reaches the commit that the branch held, so
   * **Undo** and the reflog are the only ways back to it.
   */
  onlyInReflog: boolean;
};

/**
 * Why `branch` has to stay, or null when it can go.
 *
 * The order follows how long each obstacle lasts, as `pruneMerged` orders its own: trunk never
 * clears, a checkout clears once the reader checks out something else, and a worktree clears once
 * the work there finishes.
 */
export function deletionRefusal(
  snapshot: RawData,
  branch: string
): string | null {
  if (branch === snapshot.trunkBranch) {
    return `${branch} is the trunk that this tree measures every branch against`;
  }
  if (branch === snapshot.headBranch) {
    return `you have ${branch} checked out — Goto another commit first`;
  }
  const worktree = snapshot.heldBranches.get(branch);
  return worktree ? `another worktree holds ${branch} (${worktree})` : null;
}

/**
 * Whether deleting the branch would leave its commit reachable from nothing but the reflog.
 *
 * Called before the deletion, while the branch still exists, so the branch itself is the one match
 * to discount. A remote-tracking ref counts, because a pushed commit is still on the server.
 */
async function onlyInReflog(
  git: GitRunner,
  branch: string,
  sha: string
): Promise<boolean> {
  const output = await git.run([
    "for-each-ref",
    "--contains",
    sha,
    "--format=%(refname)",
    "refs/heads",
    "refs/remotes",
    "refs/tags",
  ]);
  const holders = output
    .split("\n")
    .filter(Boolean)
    .filter(ref => ref !== `refs/heads/${branch}`);
  return holders.length === 0;
}

/**
 * Delete `branch`, and report whether its commits are now reflog-only.
 *
 * The branch's `branch.<name>` config section goes too, as `git branch -D` would remove it. The
 * next branch created under that name would inherit the old upstream from a section left behind.
 */
export async function deleteBranch(
  git: GitRunner,
  snapshot: RawData,
  branch: string
): Promise<BranchDeletion> {
  const refusal = deletionRefusal(snapshot, branch);
  if (refusal) {
    throw new GitError(`Cannot delete ${branch}: ${refusal}.`, COMMAND);
  }
  const sha = await git.tryRun([
    "rev-parse",
    "--verify",
    `refs/heads/${branch}`,
  ]);
  if (!sha) {
    throw new GitError(`${branch} does not exist here.`, COMMAND);
  }
  const reflogOnly = await onlyInReflog(git, branch, sha);
  await git.run(["update-ref", "-d", `refs/heads/${branch}`, sha]);
  // Absent for a branch that never had an upstream, which is not a failure.
  await git.tryRun(["config", "--remove-section", `branch.${branch}`]);
  return { branch, sha, onlyInReflog: reflogOnly };
}
