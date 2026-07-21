import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

interface Snapshot {
  score: number;
  clashes: number;
  contactCount: number;
  contacts: string[];
}

interface LearningModule {
  captureLearningSnapshot(
    score: number | null,
    contacts: readonly { residue: string; distance?: number }[],
    clashes: number | null,
    candidateContactCount?: number | null,
  ): Snapshot | null;
  compareLearningSnapshots(
    baseline: Snapshot,
    final: Snapshot,
  ): {
    scoreDelta: number;
    clashDelta: number;
    contactDelta: number;
    predictionOutcome: string;
  };
  createLearningReceipt(
    prediction: string,
    explanation: string,
    baseline: Snapshot,
    final: Snapshot,
    completedAt?: string,
  ): {
    schemaVersion: string;
    path: Record<string, string>;
    pre: { observedOutcome: string; correct: boolean };
    observation: {
      scoreDelta: number;
      clashDelta: number;
      contactDelta: number;
      predictionOutcome: string;
    };
    controlledPathInvariantMet: boolean;
    scope: string;
  };
}

const componentUrl = new URL("../app/components/LearningChallenge.tsx", import.meta.url);
const stylesheetUrl = new URL("../app/components/learning-challenge.css", import.meta.url);
let server: ViteDevServer;
let learning: LearningModule;

before(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  learning = (await server.ssrLoadModule(
    "/app/components/LearningChallenge.tsx",
  )) as LearningModule;
});

after(async () => {
  await server.close();
});

test("receipt grades the prediction against actual controlled deltas", () => {
  const baseline = learning.captureLearningSnapshot(
    4.370703,
    [{ residue: "ASN49 A", distance: 3.14 }],
    4,
    5,
  );
  const final = learning.captureLearningSnapshot(
    -8.974162,
    [
      { residue: "ASN49 A", distance: 2.78 },
      { residue: "SER45 A", distance: 2.93 },
    ],
    0,
    7,
  );
  assert.ok(baseline);
  assert.ok(final);

  const observation = learning.compareLearningSnapshots(baseline, final);
  assert.deepEqual(observation, {
    scoreDelta: -13.34,
    clashDelta: -4,
    contactDelta: 2,
    scoreDirection: "lower",
    clashDirection: "fewer",
    predictionOutcome: "lower-score-fewer-clashes",
  });

  const receipt = learning.createLearningReceipt(
    "lower-score-not-fewer-clashes",
    "prepared-model-comparison",
    baseline,
    final,
    "2026-07-21T12:00:00.000Z",
  );
  assert.equal(receipt.pre.observedOutcome, "lower-score-fewer-clashes");
  assert.equal(receipt.pre.correct, false);
  assert.equal(receipt.controlledPathInvariantMet, true);
  assert.deepEqual(receipt.path, {
    baselinePose: "exact-15-degree-reset-challenge",
    gradedAction: "reveal-pdb-pose",
    finalPose: "locked-pdb-reference",
  });
  assert.match(receipt.scope, /does not demonstrate learning efficacy/i);
});

test("prediction grading follows an unexpected observation instead of a hardcoded answer", () => {
  const baseline: Snapshot = {
    score: -3,
    clashes: 2,
    contactCount: 1,
    contacts: ["ASN49 A"],
  };
  const final: Snapshot = {
    score: -2,
    clashes: 0,
    contactCount: 1,
    contacts: ["ASN49 A"],
  };
  const receipt = learning.createLearningReceipt(
    "not-lower-score-fewer-clashes",
    "prepared-model-comparison",
    baseline,
    final,
  );

  assert.equal(receipt.observation.predictionOutcome, "not-lower-score-fewer-clashes");
  assert.equal(receipt.pre.correct, true);
  assert.equal(receipt.controlledPathInvariantMet, false);
});

test("component gates grading on reset, reveal, and locked-reference states", async () => {
  const [source, stylesheet] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(stylesheetUrl, "utf8"),
  ]);

  assert.match(source, /poseState === "challenge" && metricsReady/);
  assert.match(source, /revealRequested &&[\s\S]*poseState === "reference"/);
  assert.match(source, /poseState === "reference"/);
  assert.match(source, /disabled=\{!revealCompleted\}/);
  assert.match(source, /Reveal is the only graded action/);
  assert.match(source, /Free-move data is excluded/);
  assert.match(source, /Controlled path interrupted/);
  assert.doesNotMatch(source, /onFocusStage|Move the molecule/);
  assert.doesNotMatch(source, /fetch\s*\(|localStorage|sessionStorage/);
  assert.match(source, /does not demonstrate learning efficacy/i);
  assert.match(source, /<fieldset/);
  assert.match(source, /aria-live="polite"/);
  assert.match(stylesheet, /min-height: 48px/);
  assert.match(stylesheet, /touch-action: manipulation/);
  assert.match(stylesheet, /prefers-reduced-motion: reduce/);
});
