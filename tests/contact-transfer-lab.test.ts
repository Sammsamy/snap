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
  path: {
    baselinePose: "exact-15-degree-reset-challenge";
    gradedAction: "reveal-pdb-pose";
    finalPose: "locked-pdb-reference";
  };
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

interface TransferState {
  lockedPrediction: "increase" | "unchanged" | "decrease" | null;
  threeCeThreeViewedBeforeLock: boolean;
  firstResult: null | {
    baselineScore: number;
    finalScore: number;
    baselineClashes: number;
    finalClashes: number;
    baselineContacts: number;
    finalContacts: number;
    scoreDelta: number;
    clashDelta: number;
    contactDelta: number;
    contactDirection: "increase" | "unchanged" | "decrease";
    contactCountShortcutFalsified: boolean;
    prediction: "increase" | "unchanged" | "decrease";
    predictionMatched: boolean;
  };
}

interface TransferModule {
  ContactCountTransferLab: React.ComponentType<{
    oneStpReceipt?: ReceiptFixture;
    threeCeThreeReceipt?: ReceiptFixture;
    activeTarget: "1stp" | "3ce3";
    transferState: TransferState;
    onLockPrediction: (
      prediction: "increase" | "unchanged" | "decrease",
    ) => void;
    onSelectTarget: (targetId: "3ce3") => void;
  }>;
  EMPTY_CONTACT_TRANSFER_STATE: TransferState;
  deriveContactTransferResult(
    receipt: ReceiptFixture,
    prediction: "increase" | "unchanged" | "decrease",
  ): TransferState["firstResult"];
  lockContactTransferPrediction(
    state: TransferState,
    prediction: "increase" | "unchanged" | "decrease",
  ): TransferState;
  recordThreeCeThreeExposure(state: TransferState): TransferState;
  captureFirstContactTransferResult(
    state: TransferState,
    receipt: ReceiptFixture,
  ): TransferState;
}

const componentUrl = new URL(
  "../app/components/ContactCountTransferLab.tsx",
  import.meta.url,
);
const stylesheetUrl = new URL(
  "../app/components/contact-count-transfer-lab.css",
  import.meta.url,
);

let server: ViteDevServer;
let transferModule: TransferModule;

function makeReceipt(
  overrides: Partial<ReceiptFixture> = {},
): ReceiptFixture {
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
      correct: true,
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
      contactDelta: -1,
      scoreDirection: "lower",
      clashDirection: "fewer",
      predictionOutcome: "lower-score-fewer-clashes",
    },
    final: {
      score: -11.6442810143,
      clashes: 1,
      contactCount: 3,
      contacts: [],
    },
    controlledPathInvariantMet: true,
    post: { answer: "prepared-model-comparison", correct: true },
    correctChecks: 2,
    totalChecks: 2,
    scope:
      "Single-session task receipt retained only in open-page memory, cleared on refresh, and never sent; it does not demonstrate learning efficacy, clinical validation, or population outcomes.",
    ...overrides,
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
  transferModule = (await server.ssrLoadModule(
    "/app/components/ContactCountTransferLab.tsx",
  )) as TransferModule;
});

after(async () => {
  await server.close();
});

test("derives the audited 3CE3 contact-count counterexample", () => {
  const result = transferModule.deriveContactTransferResult(
    makeReceipt(),
    "decrease",
  );

  assert.ok(result);
  assert.equal(result.baselineScore, 145.802134522);
  assert.equal(result.finalScore, -11.6442810143);
  assert.equal(result.baselineClashes, 17);
  assert.equal(result.finalClashes, 1);
  assert.equal(result.baselineContacts, 4);
  assert.equal(result.finalContacts, 3);
  assert.equal(result.scoreDelta, -157.45);
  assert.equal(result.clashDelta, -16);
  assert.equal(result.contactDelta, -1);
  assert.equal(result.contactDirection, "decrease");
  assert.equal(result.contactCountShortcutFalsified, true);
  assert.equal(result.predictionMatched, true);
});

test("locks one blind answer and preserves the first controlled result", () => {
  const empty = transferModule.EMPTY_CONTACT_TRANSFER_STATE;
  const locked = transferModule.lockContactTransferPrediction(
    empty,
    "increase",
  );
  const relock = transferModule.lockContactTransferPrediction(
    locked,
    "decrease",
  );
  assert.equal(relock, locked);
  assert.equal(relock.lockedPrediction, "increase");

  const captured = transferModule.captureFirstContactTransferResult(
    locked,
    makeReceipt(),
  );
  assert.ok(captured.firstResult);
  assert.equal(captured.firstResult.predictionMatched, false);

  const replacementReceipt = makeReceipt({
    baseline: { score: 5, clashes: 2, contactCount: 1, contacts: [] },
    final: { score: -2, clashes: 0, contactCount: 2, contacts: [] },
    observation: {
      scoreDelta: -7,
      clashDelta: -2,
      contactDelta: 1,
      scoreDirection: "lower",
      clashDirection: "fewer",
      predictionOutcome: "lower-score-fewer-clashes",
    },
  });
  const afterRerun = transferModule.captureFirstContactTransferResult(
    captured,
    replacementReceipt,
  );
  assert.equal(afterRerun, captured);
  assert.equal(afterRerun.firstResult?.contactDelta, -1);
});

test("prior 3CE3 exposure disables the blind transfer path", () => {
  const exposed = transferModule.recordThreeCeThreeExposure(
    transferModule.EMPTY_CONTACT_TRANSFER_STATE,
  );
  assert.equal(exposed.threeCeThreeViewedBeforeLock, true);
  assert.equal(
    transferModule.lockContactTransferPrediction(exposed, "increase"),
    exposed,
  );

  const html = renderToStaticMarkup(
    React.createElement(transferModule.ContactCountTransferLab, {
      oneStpReceipt: makeReceipt(),
      activeTarget: "1stp",
      transferState: exposed,
      onLockPrediction() {},
      onSelectTarget() {},
    }),
  );
  assert.equal(html, "");
});

test("fails closed on an invalid path or inconsistent deltas", () => {
  assert.equal(
    transferModule.deriveContactTransferResult(
      makeReceipt({ controlledPathInvariantMet: false }),
      "decrease",
    ),
    null,
  );

  const inconsistent = makeReceipt({
    observation: {
      scoreDelta: -1,
      clashDelta: -16,
      contactDelta: -1,
      scoreDirection: "lower",
      clashDirection: "fewer",
      predictionOutcome: "lower-score-fewer-clashes",
    },
  });
  assert.equal(
    transferModule.deriveContactTransferResult(inconsistent, "decrease"),
    null,
  );

  const noncanonicalFingerprint = makeReceipt({
    baseline: { score: 5, clashes: 2, contactCount: 1, contacts: [] },
    final: { score: -2, clashes: 0, contactCount: 2, contacts: [] },
    observation: {
      scoreDelta: -7,
      clashDelta: -2,
      contactDelta: 1,
      scoreDirection: "lower",
      clashDirection: "fewer",
      predictionOutcome: "lower-score-fewer-clashes",
    },
  });
  assert.equal(
    transferModule.deriveContactTransferResult(
      noncanonicalFingerprint,
      "increase",
    ),
    null,
  );
});

test("blind transfer form is accessible and withholds the 3CE3 result", () => {
  const html = renderToStaticMarkup(
    React.createElement(transferModule.ContactCountTransferLab, {
      oneStpReceipt: makeReceipt(),
      activeTarget: "1stp",
      transferState: transferModule.EMPTY_CONTACT_TRANSFER_STATE,
      onLockPrediction() {},
      onSelectTarget() {},
    }),
  );

  assert.match(html, /Blind transfer lab/);
  assert.match(html, /Predict the second target’s contact count/);
  assert.match(html, /<fieldset>/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
  assert.match(html, /Lock prediction and open 3CE3/);
  assert.match(html, /disabled=""/);
  assert.match(html, /single-session transfer check/i);
  assert.doesNotMatch(html, /145\.80|−11\.64|17 → 1|4 → 3/);
});

test("completed transfer panel shows only the target-local counterexample", () => {
  const locked = transferModule.lockContactTransferPrediction(
    transferModule.EMPTY_CONTACT_TRANSFER_STATE,
    "increase",
  );
  const completed = transferModule.captureFirstContactTransferResult(
    locked,
    makeReceipt(),
  );
  const html = renderToStaticMarkup(
    React.createElement(transferModule.ContactCountTransferLab, {
      oneStpReceipt: makeReceipt(),
      threeCeThreeReceipt: makeReceipt(),
      activeTarget: "3ce3",
      transferState: completed,
      onLockPrediction() {},
      onSelectTarget() {},
    }),
  );

  assert.match(html, /The contact-count shortcut breaks/);
  assert.match(html, /Counterexample observed/);
  assert.match(html, /\+145\.80 → −11\.64/);
  assert.match(html, /17 → 1/);
  assert.match(html, /4 → 3/);
  assert.match(html, /marker count does not determine the AutoGrid score/i);
  assert.match(html, /not a mastery score, learning-efficacy result/i);
  assert.doesNotMatch(html, /1STP[^<]*[-+−]\d/);
});

test("waiting status does not contain an interactive control", () => {
  const locked = transferModule.lockContactTransferPrediction(
    transferModule.EMPTY_CONTACT_TRANSFER_STATE,
    "increase",
  );
  const html = renderToStaticMarkup(
    React.createElement(transferModule.ContactCountTransferLab, {
      oneStpReceipt: makeReceipt(),
      activeTarget: "1stp",
      transferState: locked,
      onLockPrediction() {},
      onSelectTarget() {},
    }),
  );
  const statusContents = html.match(
    /<div role="status"[^>]*>([^]*?)<[/]div>/,
  )?.[1];
  assert.ok(statusContents);
  assert.doesNotMatch(statusContents, /<button/);
  assert.match(html, /<button[^>]*>Open 3CE3<[/]button>/);
});

test("component has no storage, telemetry, or automatic reveal path", async () => {
  const [source, stylesheet] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(stylesheetUrl, "utf8"),
  ]);

  assert.doesNotMatch(
    source,
    /localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|sendBeacon/,
  );
  assert.doesNotMatch(source, /onRevealReferencePose|revealExperimentalPose/);
  assert.match(source, /firstResult/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Candidate markers never enter the AutoGrid total/);
  assert.match(stylesheet, /min-height:\s*46px/);
  assert.match(stylesheet, /@media \(max-width: 620px\)/);
  assert.match(stylesheet, /forced-colors: active/);
});
