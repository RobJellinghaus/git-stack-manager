/**
 * What the toast reports after a stack moves onto its remote.
 *
 * `adoptReport` folds four independent parts into one sentence: the layers that moved, the layers
 * already current, the layers skipped, and the layer whose checkout moved. The assertions read that
 * sentence, because the wording otherwise turns a skipped layer into a clean success.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { adoptReport } from "../src/webview/model/adoptReport.mts";

/** @param {Partial<import("../src/webview/model/adoptReport.mts").AdoptReportInput>} parts */
function outcome(parts) {
  return {
    moved: [],
    current: [],
    skipped: [],
    checkedOut: null,
    ...parts,
  };
}

test("a plain move counts the layers and does not warn", () => {
  const report = adoptReport(outcome({ moved: ["lower", "middle"] }));

  assert.equal(report.text, "Moved 2 layers onto the remote ✓");
  assert.equal(report.warn, false);
});

test("one layer reads as a layer rather than as 1 layers", () => {
  assert.equal(
    adoptReport(outcome({ moved: ["lower"] })).text,
    "Moved 1 layer onto the remote ✓"
  );
});

test("the sentence names a moved checkout, because git reset rewrote files on disk", () => {
  const report = adoptReport(
    outcome({ moved: ["lower", "middle"], checkedOut: "middle" })
  );

  assert.match(report.text, /your files moved with middle/);
  assert.equal(report.warn, false);
});

test("a skipped layer carries its reason, and the toast warns", () => {
  const report = adoptReport(
    outcome({
      moved: ["lower"],
      skipped: [{ branch: "upper", reason: "origin/upper no longer exists" }],
    })
  );

  assert.equal(
    report.text,
    "Moved 1 layer onto the remote — left upper (origin/upper no longer exists) ✓"
  );
  assert.equal(report.warn, true);
});

test("the sentence for a stack already on its remote carries no warning", () => {
  const report = adoptReport(outcome({ current: ["lower", "middle"] }));

  assert.equal(
    report.text,
    "Every layer already points at its remote's commit"
  );
  assert.equal(report.warn, false);
});

test("the toast warns rather than reporting success when nothing is pushed", () => {
  const report = adoptReport(
    outcome({
      skipped: [
        { branch: "lower", reason: "it tracks no remote branch" },
        { branch: "upper", reason: "it tracks no remote branch" },
      ],
    })
  );

  assert.equal(
    report.text,
    "Nothing to move — left lower (it tracks no remote branch) and upper (it tracks no remote branch)"
  );
  assert.equal(report.warn, true);
});
