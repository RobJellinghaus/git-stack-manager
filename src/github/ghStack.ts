/**
 * ghStack — read the `gh stack` extension's local state, and drive its commands.
 *
 * GitHub's stacked pull requests (public preview) already model the thing this
 * extension draws: an ordered chain of branches, each based on the one below,
 * submitted as linked PRs. Where `gh stack` has a command, calling it beats
 * reimplementing the behaviour — it owns the server-side stack object, and a
 * hand-rolled equivalent would drift from it.
 *
 * Stack membership is read from `.git/gh-stack` rather than from
 * `gh stack view --json`. The file is the extension's own state, carries an
 * explicit `schemaVersion`, and reading it costs nothing; shelling out to `gh`
 * costs ~0.5s and would put a subprocess in the render path for information
 * already sitting on disk. The commands themselves still go through `gh`.
 *
 * ## The on-disk format is not a public API
 *
 * `.git/gh-stack` is an implementation detail of a **public-preview** extension,
 * so unlike `gh stack view --json` it carries no compatibility promise. Two things
 * guard against a format change: the `schemaVersion` check below bails out rather
 * than guessing, and `needsRebase` is derived here but verified against
 * `gh stack view --json` in the tests, so a divergence shows up as a test failure
 * rather than a wrong badge.
 *
 * **Keeping in sync:** when `gh stack` releases a new version, run
 * `gh stack view --json` against a repository with a stack and compare it to what
 * this module reports. If the schema version has moved, read the new file and
 * decide whether the extra fields are worth adopting; if the badges silently
 * disappear, that is the version check doing its job.
 *
 * - Feature docs: https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/managing-stacked-pull-requests
 * - CLI reference: https://cli.github.com/manual/gh_stack
 */
import { existsSync, readFileSync } from "fs";
import { asArray, asRecord } from "#core/values";

/** The schema of `.git/gh-stack` this reader understands. */
const SUPPORTED_SCHEMA_VERSION = 1;

export type GhStackBranch = {
  branch: string;
  /** Sha the branch is based on — the tip of the layer below, or trunk. */
  base: string;
};

export type GhStackInfo = {
  trunkBranch: string;
  trunkHead: string;
  /** Branches bottom-to-top, the order `gh stack` replays them in. */
  branches: GhStackBranch[];
};

/** Per-branch stack placement, for annotating the graph. */
export type StackMembership = {
  /** 1-based position from the bottom of the stack. */
  position: number;
  /**
   * Every branch in the stack, bottom-to-top, including this one.
   *
   * `commitMenuItems` reads the list rather than a count, because `submit`, `push`, and `sync`
   * find their stack through the checked-out branch: it tests HEAD against these names, and
   * offers a checkout of the top one. The layer count comes off `length`.
   */
  branches: string[];
  /** The branch does not contain the tip of the layer below — needs a rebase. */
  needsRebase: boolean;
  /**
   * `.git/gh-stack` records a base that is not the tip of the layer below.
   *
   * Set independently of `needsRebase`; `indexStackMembership` names the case where the two
   * disagree. `Repository` checks this one to confirm a re-record landed.
   */
  recordedBaseStale: boolean;
};

/**
 * Read every stack `gh stack` tracks in this repository. Returns an empty list
 * when the extension is not in use, which is the common case.
 */
export function readGhStacks(gitDirectory: string): GhStackInfo[] {
  const statePath = `${gitDirectory}/gh-stack`;
  if (!existsSync(statePath)) {
    return [];
  }
  let state: unknown;
  try {
    state = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return []; // truncated or hand-edited state
  }
  const root = asRecord(state);
  // An unknown schema means `gh stack` changed its format. Ignoring it loses
  // badges; guessing at it would show wrong ones.
  if (root?.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    return [];
  }

  return asArray(root.stacks)
    .map(readStack)
    .filter((stack): stack is GhStackInfo => stack !== null);
}

function readStack(value: unknown): GhStackInfo | null {
  const stack = asRecord(value);
  if (!stack) {
    return null;
  }
  const trunk = asRecord(stack.trunk);
  const branches = asArray(stack.branches)
    .map(asRecord)
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry?.branch === "string"
    )
    .map(entry => ({
      branch: String(entry.branch),
      base: typeof entry.base === "string" ? entry.base : "",
    }));
  if (!branches.length) {
    return null;
  }
  return {
    trunkBranch: typeof trunk?.branch === "string" ? trunk.branch : "",
    trunkHead: typeof trunk?.head === "string" ? trunk.head : "",
    branches,
  };
}

/**
 * Whether the commit at `tip` has `target` in its history — the test `gh stack` applies to each
 * layer against the one below. `null` when `parentsOfSha` covers too little history for an answer.
 *
 * Walks the parents the snapshot already carries, so the verdict costs no subprocess at render
 * time. Those parents cover local history only, because the reader's walk stops at trunk, and that
 * bounds the answers available. A target inside local history is either found or genuinely missing.
 * A target at or below trunk that the walk never reaches yields `null`, and the caller falls back
 * on the recorded sha.
 */
function contains(
  tip: string | undefined,
  target: string | undefined,
  parentsOfSha: Map<string, string[]>
): boolean | null {
  if (!tip || !target) {
    return null;
  }
  const seen = new Set<string>();
  const frontier = [tip];
  while (frontier.length) {
    const sha = frontier.pop();
    if (!sha || seen.has(sha)) {
      continue;
    }
    seen.add(sha);
    if (sha === target) {
      return true;
    }
    // A sha with no recorded parents is where local history ends. The equality check above
    // already ran on it, which covers a layer sitting directly on the trunk tip.
    frontier.push(...(parentsOfSha.get(sha) ?? []));
  }
  return parentsOfSha.has(target) ? false : null;
}

/**
 * Map each stacked branch to its position, and flag the ones that need a rebase.
 *
 * `needsRebase` applies `gh stack`'s own test: does this branch contain the tip of the layer below?
 * A rebase that carried the whole stack is where that parts company with `recordedBaseStale`. Such
 * a rebase replaces every commit, so every recorded base names a replaced one, while each layer
 * still sits on the one below and none of them needs a rebase. `gh stack view --json` reports
 * `false` for all of them, and so does this function once `parentsOfSha` arrives.
 *
 * Called without `parentsOfSha`, the recorded sha is the only evidence left and that same stack
 * reads as needing a rebase. `Repository.readStackState` takes that reading deliberately, to check
 * whether a re-record landed.
 */
export function indexStackMembership(
  stacks: GhStackInfo[],
  shaOfBranch: Map<string, string>,
  parentsOfSha: Map<string, string[]> = new Map()
): Map<string, StackMembership> {
  const membership = new Map<string, StackMembership>();
  for (const stack of stacks) {
    // One array per stack, shared by its members rather than copied per layer.
    const branches = stack.branches.map(entry => entry.branch);
    stack.branches.forEach((entry, index) => {
      const below =
        index === 0
          ? stack.trunkBranch
          : (stack.branches[index - 1]?.branch ?? stack.trunkBranch);
      const expectedBase =
        index === 0 ? stack.trunkHead : shaOfBranch.get(below);
      const actualBase = shaOfBranch.get(below) ?? expectedBase;
      const recordedBaseStale = Boolean(
        entry.base && actualBase && entry.base !== actualBase
      );
      const holdsLayerBelow = contains(
        shaOfBranch.get(entry.branch),
        actualBase,
        parentsOfSha
      );
      membership.set(entry.branch, {
        position: index + 1,
        branches,
        needsRebase:
          holdsLayerBelow === null ? recordedBaseStale : !holdsLayerBelow,
        recordedBaseStale,
      });
    });
  }
  return membership;
}

/**
 * The stacks holding any of `branches` — the ones a rebase of those branches moved.
 *
 * The scope matters, because the repair is not safe everywhere. On a stack the rebase just
 * carried, `gh stack rebase <bottom> --no-trunk` finds every layer already in place and rewrites
 * bases only. On an untouched stack whose record went stale for another reason — a layer amended
 * by hand — the same command rewrites commits the reader never asked it to touch.
 */
export function stacksHolding(
  stacks: GhStackInfo[],
  branches: string[]
): GhStackInfo[] {
  const moved = new Set(branches);
  return stacks.filter(stack =>
    stack.branches.some(entry => moved.has(entry.branch))
  );
}

/**
 * Commands this extension delegates to `gh stack`, with what each one means.
 *
 * Only `rebase` takes a branch, because it is the only one of the four that accepts one. The other
 * three find their stack through the checked-out branch.
 */
export type GhStackCommand =
  | { kind: "submit" }
  | { kind: "sync"; prune: boolean }
  | { kind: "push" }
  | {
      kind: "rebase";
      scope: "all" | "downstack" | "upstack";
      /**
       * The layer clicked on, which selects the stack to rebase. Spelled out as `| undefined`
       * because `parseGhStackCommand` fills it from `optionalString`, and
       * `exactOptionalPropertyTypes` rejects that against a plain optional.
       */
      branch?: string | undefined;
      /**
       * Replay each layer onto the one below and leave trunk out of it — `--no-trunk`.
       * `Repository.recordStackBases` is the caller, and explains what the flag buys there.
       */
      noTrunk?: boolean | undefined;
    };

/** The `gh` invocation for a command, run through `#github/ghRunner` like any other. */
export function ghStackArguments(command: GhStackCommand): string[] {
  switch (command.kind) {
    case "submit":
      return ["stack", "submit"];
    case "sync":
      // --prune drops local branches whose PRs merged, which is the state this
      // extension otherwise renders as "upstream gone".
      return command.prune ? ["stack", "sync", "--prune"] : ["stack", "sync"];
    case "push":
      // gh stack push uses --force-with-lease, so an amended stack updates
      // safely instead of needing a manual force push.
      return ["stack", "push"];
    case "rebase": {
      // Naming the branch picks the stack, so a rebase runs while HEAD sits on trunk. Without it
      // `gh stack rebase` reads HEAD, which names no single stack when two are rooted at `main`.
      const invocation = command.branch
        ? ["stack", "rebase", command.branch]
        : ["stack", "rebase"];
      if (command.scope !== "all") {
        invocation.push(`--${command.scope}`);
      }
      if (command.noTrunk) {
        invocation.push("--no-trunk");
      }
      return invocation;
    }
  }
}
