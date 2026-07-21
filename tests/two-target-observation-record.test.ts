import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";

interface ReceiptFixture {
  schemaVersion: "1.1";
  assessment: "snap-controlled-predict-reveal-explain";
  completedAt: string;
  path: Record<string, string>;
  pre: { answer: string; observedOutcome: string; correct: boolean };
  baseline: {
    score: number;
    clashes: number;
    contactCount: number;
    contacts: string[];
  };
  observation: {
    scoreDelta: number;
    clashDelta: number;
    contactDelta: number;
    scoreDirection: "lower" | "not-lower";
    clashDirection: "fewer" | "not-fewer";
    predictionOutcome: string;
  };
  final: {
    score: number;
    clashes: number;
    contactCount: number;
    contacts: string[];
  };
  controlledPathInvariantMet: boolean;
  post: { answer: string; correct: boolean };
  correctChecks: number;
  totalChecks: 2;
  scope: string;
}

type ObservationRecordFixture = Record<
  string,
  {
    targetId: string;
    contextLabel: string;
    receipt: ReceiptFixture;
  }
>;

interface ObservationModule {
  TwoTargetObservationRecord: React.ComponentType<{
    observations: Record<string, unknown>;
    activeTarget: "1stp" | "3ce3";
    contactTransferState: {
      lockedPrediction: null;
      firstResult: null;
      threeCeThreeViewedBeforeLock: boolean;
    };
    onLockContactPrediction: () => void;
    onSelectTarget: (targetId: "1stp" | "3ce3") => void;
  }>;
  summarizeTargetLocalOutcome(receipt: ReceiptFixture): {
    score: string;
    overlaps: string;
    candidateMarkers: string;
  };
  upsertTargetObservation(
    observations: Record<string, unknown>,
    targetId: "1stp" | "3ce3",
    contextLabel: string,
    receipt: ReceiptFixture,
  ): ObservationRecordFixture;
}

const componentUrl = new URL(
  "../app/components/TwoTargetObservationRecord.tsx",
  import.meta.url,
);
const stylesheetUrl = new URL(
  "../app/components/two-target-observation-record.css",
  import.meta.url,
);
const experienceUrl = new URL(
  "../app/components/SnapExperience.tsx",
  import.meta.url,
);

let server: ViteDevServer;
let observationModule: ObservationModule;

function makeReceipt({
  correctChecks = 2,
  scoreDirection = "lower",
  clashDirection = "fewer",
  contactDelta = 2,
}: {
  correctChecks?: number;
  scoreDirection?: "lower" | "not-lower";
  clashDirection?: "fewer" | "not-fewer";
  contactDelta?: number;
} = {}): ReceiptFixture {
  return {
    schemaVersion: "1.1",
    assessment: "snap-controlled-predict-reveal-explain",
    completedAt: "2026-07-21T12:00:00.000Z",
    path: {
      baselinePose: "exact-15-degree-reset-challenge",
      gradedAction: "reveal-pdb-pose",
      finalPose: "locked-pdb-reference",
    },
    pre: {
      answer: "lower-score-fewer-clashes",
      observedOutcome: "lower-score-fewer-clashes",
      correct: correctChecks > 0,
    },
    baseline: {
      score: 145.802134522,
      clashes: 17,
      contactCount: 4,
      contacts: [],
    },
    observation: {
      scoreDelta: -157.45,
      clashDelta: -16,
      contactDelta,
      scoreDirection,
      clashDirection,
      predictionOutcome: "lower-score-fewer-clashes",
    },
    final: {
      score: -11.6442810143,
      clashes: 1,
      contactCount: 3,
      contacts: [],
    },
    controlledPathInvariantMet: true,
    post: {
      answer: "prepared-model-comparison",
      correct: correctChecks === 2,
    },
    correctChecks,
    totalChecks: 2,
    scope:
      "Single-session task receipt retained only in open-page memory, cleared on refresh, and never sent; it does not demonstrate learning efficacy, clinical validation, or population outcomes.",
  };
}

before(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  observationModule = (await server.ssrLoadModule(
    "/app/components/TwoTargetObservationRecord.tsx",
  )) as ObservationModule;
});

after(async () => {
  await server.close();
});

test("upsert records either completion order without transposing targets", () => {
  const oneStpReceipt = makeReceipt({ contactDelta: 2 });
  const threeCeThreeReceipt = makeReceipt({ contactDelta: -1 });

  let forward: ObservationRecordFixture = {};
  forward = observationModule.upsertTargetObservation(
    forward,
    "1stp",
    "1STP · streptavidin / biotin",
    oneStpReceipt,
  );
  forward = observationModule.upsertTargetObservation(
    forward,
    "3ce3",
    "3CE3 · c-MET / experimental inhibitor 1FN",
    threeCeThreeReceipt,
  );

  let reverse: ObservationRecordFixture = {};
  reverse = observationModule.upsertTargetObservation(
    reverse,
    "3ce3",
    "3CE3 · c-MET / experimental inhibitor 1FN",
    threeCeThreeReceipt,
  );
  reverse = observationModule.upsertTargetObservation(
    reverse,
    "1stp",
    "1STP · streptavidin / biotin",
    oneStpReceipt,
  );

  for (const observations of [forward, reverse]) {
    assert.equal(observations["1stp"].targetId, "1stp");
    assert.equal(observations["1stp"].receipt, oneStpReceipt);
    assert.equal(observations["3ce3"].targetId, "3ce3");
    assert.equal(observations["3ce3"].receipt, threeCeThreeReceipt);
  }
});

test("wrong responses remain observed and a rerun replaces only that target", () => {
  const wrongReceipt = makeReceipt({ correctChecks: 0 });
  const otherReceipt = makeReceipt({ contactDelta: -1 });
  const replacement = makeReceipt({ correctChecks: 1, contactDelta: 0 });

  const first = observationModule.upsertTargetObservation(
    {},
    "1stp",
    "1STP · streptavidin / biotin",
    wrongReceipt,
  );
  const both = observationModule.upsertTargetObservation(
    first,
    "3ce3",
    "3CE3 · c-MET / experimental inhibitor 1FN",
    otherReceipt,
  );
  const replaced = observationModule.upsertTargetObservation(
    both,
    "1stp",
    "1STP · streptavidin / biotin",
    replacement,
  );

  assert.equal(first["1stp"].receipt.correctChecks, 0);
  assert.equal(replaced["1stp"].receipt, replacement);
  assert.equal(replaced["3ce3"].receipt, otherReceipt);
  assert.equal(both["1stp"].receipt, wrongReceipt);
});

test("summary exposes only qualitative target-local outcomes", () => {
  assert.deepEqual(
    observationModule.summarizeTargetLocalOutcome(
      makeReceipt({
        scoreDirection: "lower",
        clashDirection: "fewer",
        contactDelta: -1,
      }),
    ),
    {
      score: "Score fell",
      overlaps: "Overlap flags decreased",
      candidateMarkers: "Candidate markers changed −1",
    },
  );

  assert.deepEqual(
    observationModule.summarizeTargetLocalOutcome(
      makeReceipt({
        scoreDirection: "not-lower",
        clashDirection: "not-fewer",
        contactDelta: 0,
      }),
    ),
    {
      score: "Score did not fall",
      overlaps: "Overlap flags did not decrease",
      candidateMarkers: "Candidate markers did not change (0)",
    },
  );
});

test("render is scoped, accessible, and omits aggregates and raw scores", () => {
  const wrongReceipt = makeReceipt({ correctChecks: 0, contactDelta: -1 });
  const observations = observationModule.upsertTargetObservation(
    {},
    "3ce3",
    "3CE3 · c-MET / experimental inhibitor 1FN",
    wrongReceipt,
  );
  const html = renderToStaticMarkup(
    React.createElement(observationModule.TwoTargetObservationRecord, {
      observations,
      activeTarget: "3ce3",
      contactTransferState: {
        lockedPrediction: null,
        firstResult: null,
        threeCeThreeViewedBeforeLock: false,
      },
      onLockContactPrediction() {},
      onSelectTarget() {},
    }),
  );

  assert.match(html, /<section[^>]+aria-labelledby=/);
  assert.match(html, /<h2[^>]*>Two-target observation record<\/h2>/);
  assert.match(
    html,
    /<ul[^>]+aria-label="Prepared target observation status"/,
  );
  assert.equal((html.match(/<article/g) ?? []).length, 2);
  assert.match(html, /<dl/);
  assert.match(html, /role="status"/);
  assert.match(html, /1 of 2 targets observed/);
  assert.match(html, /0 of 2 matched/);
  assert.match(html, /Continue with 1STP/);
  assert.match(html, /Open-page memory only; this record clears on refresh/);
  assert.match(
    html,
    /not evidence of learning efficacy, competence, drug efficacy, or clinical validation/i,
  );
  assert.match(html, /scores are never combined, ranked, or compared/i);
  assert.doesNotMatch(html, /145\.80|-11\.64|157\.45/);
  assert.doesNotMatch(
    html,
    /passport|mastery|\bpass(?:ed)?\b|\bvalidated\b/i,
  );
});

test("empty records render nothing", () => {
  const html = renderToStaticMarkup(
    React.createElement(observationModule.TwoTargetObservationRecord, {
      observations: {},
      activeTarget: "1stp",
      contactTransferState: {
        lockedPrediction: null,
        firstResult: null,
        threeCeThreeViewedBeforeLock: false,
      },
      onLockContactPrediction() {},
      onSelectTarget() {},
    }),
  );

  assert.equal(html, "");
});

test("prior 3CE3 exposure restores the ordinary continuation path", () => {
  const observations = observationModule.upsertTargetObservation(
    {},
    "1stp",
    "1STP · streptavidin / biotin",
    makeReceipt(),
  );
  const html = renderToStaticMarkup(
    React.createElement(observationModule.TwoTargetObservationRecord, {
      observations,
      activeTarget: "1stp",
      contactTransferState: {
        lockedPrediction: null,
        firstResult: null,
        threeCeThreeViewedBeforeLock: true,
      },
      onLockContactPrediction() {},
      onSelectTarget() {},
    }),
  );

  assert.doesNotMatch(html, /Blind transfer lab/);
  assert.match(html, /Continue with 3CE3/);
});

test("component has no storage or network path and CTA meets touch sizing", async () => {
  const [source, stylesheet, experience] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(stylesheetUrl, "utf8"),
    readFile(experienceUrl, "utf8"),
  ]);

  assert.doesNotMatch(source, /localStorage|sessionStorage|fetch\s*\(/);
  assert.doesNotMatch(source, /baseline\.score|final\.score|\.reduce\s*\(/);
  assert.match(source, /aria-live="polite"/);
  assert.match(stylesheet, /min-height:\s*44px/);
  assert.match(stylesheet, /@media \(max-width: 560px\)/);
  assert.match(experience, /useState<TwoTargetObservations>\(\{\}\)/);
  assert.match(experience, /useState<ContactTransferState>/);
  assert.match(experience, /captureFirstContactTransferResult\(/);
  assert.match(experience, /upsertTargetObservation\(/);
  assert.match(experience, /onComplete=\{handleLearningComplete\}/);
  assert.match(experience, /<TwoTargetObservationRecord/);
  assert.match(experience, /data-target-id=\{targetId\}/);
  assert.doesNotMatch(experience, /localStorage|sessionStorage/);
});
