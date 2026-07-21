"use client";

import { useId, useState } from "react";
import type { LearningChallengeReceipt } from "./LearningChallenge";
import "./contact-count-transfer-lab.css";

export type CandidateContactPrediction =
  | "increase"
  | "unchanged"
  | "decrease";

export interface ContactTransferResult {
  readonly targetId: "3ce3";
  readonly baselineScore: number;
  readonly finalScore: number;
  readonly baselineClashes: number;
  readonly finalClashes: number;
  readonly baselineContacts: number;
  readonly finalContacts: number;
  readonly scoreDelta: number;
  readonly clashDelta: number;
  readonly contactDelta: number;
  readonly contactDirection: CandidateContactPrediction;
  readonly contactCountShortcutFalsified: boolean;
  readonly prediction: CandidateContactPrediction;
  readonly predictionMatched: boolean;
}

export interface ContactTransferState {
  readonly lockedPrediction: CandidateContactPrediction | null;
  readonly firstResult: Readonly<ContactTransferResult> | null;
  readonly threeCeThreeViewedBeforeLock: boolean;
}

export const EMPTY_CONTACT_TRANSFER_STATE: Readonly<ContactTransferState> =
  Object.freeze({
    lockedPrediction: null,
    firstResult: null,
    threeCeThreeViewedBeforeLock: false,
  });

const AUDITED_3CE3_TRANSFER = Object.freeze({
  baselineScore: 145.802134522,
  finalScore: -11.6442810143,
  baselineClashes: 17,
  finalClashes: 1,
  baselineContacts: 4,
  finalContacts: 3,
});

const AUDITED_SCORE_TOLERANCE = 0.011;

const PREDICTION_OPTIONS: readonly {
  id: CandidateContactPrediction;
  title: string;
  detail: string;
}[] = [
  {
    id: "increase",
    title: "Increase",
    detail: "The prepared pose will show more candidate-contact markers.",
  },
  {
    id: "unchanged",
    title: "Stay the same",
    detail: "The candidate-contact marker count will not change.",
  },
  {
    id: "decrease",
    title: "Decrease",
    detail: "The prepared pose will show fewer candidate-contact markers.",
  },
];

function roundToHundredth(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function contactDirection(delta: number): CandidateContactPrediction {
  if (delta > 0) return "increase";
  if (delta < 0) return "decrease";
  return "unchanged";
}

function isFiniteSnapshot(receipt: LearningChallengeReceipt): boolean {
  return [
    receipt.baseline.score,
    receipt.final.score,
    receipt.baseline.clashes,
    receipt.final.clashes,
    receipt.baseline.contactCount,
    receipt.final.contactCount,
  ].every(Number.isFinite);
}

export function deriveContactTransferResult(
  receipt: LearningChallengeReceipt,
  prediction: CandidateContactPrediction,
): ContactTransferResult | null {
  if (
    !isFiniteSnapshot(receipt) ||
    !receipt.controlledPathInvariantMet ||
    receipt.path.baselinePose !== "exact-15-degree-reset-challenge" ||
    receipt.path.gradedAction !== "reveal-pdb-pose" ||
    receipt.path.finalPose !== "locked-pdb-reference"
  ) {
    return null;
  }

  const scoreDelta = roundToHundredth(
    receipt.final.score - receipt.baseline.score,
  );
  const clashDelta = receipt.final.clashes - receipt.baseline.clashes;
  const contactDelta =
    receipt.final.contactCount - receipt.baseline.contactCount;

  if (
    Math.abs(scoreDelta - receipt.observation.scoreDelta) > 0.011 ||
    clashDelta !== receipt.observation.clashDelta ||
    contactDelta !== receipt.observation.contactDelta
  ) {
    return null;
  }

  const matchesAuditedThreeCeThreeFingerprint =
    Math.abs(
      receipt.baseline.score - AUDITED_3CE3_TRANSFER.baselineScore,
    ) <= AUDITED_SCORE_TOLERANCE &&
    Math.abs(receipt.final.score - AUDITED_3CE3_TRANSFER.finalScore) <=
      AUDITED_SCORE_TOLERANCE &&
    receipt.baseline.clashes === AUDITED_3CE3_TRANSFER.baselineClashes &&
    receipt.final.clashes === AUDITED_3CE3_TRANSFER.finalClashes &&
    receipt.baseline.contactCount === AUDITED_3CE3_TRANSFER.baselineContacts &&
    receipt.final.contactCount === AUDITED_3CE3_TRANSFER.finalContacts;

  if (!matchesAuditedThreeCeThreeFingerprint) return null;

  const direction = contactDirection(contactDelta);
  const contactCountShortcutFalsified =
    scoreDelta < -0.01 && clashDelta < 0 && contactDelta < 0;
  if (!contactCountShortcutFalsified) return null;

  return Object.freeze({
    targetId: "3ce3",
    baselineScore: receipt.baseline.score,
    finalScore: receipt.final.score,
    baselineClashes: receipt.baseline.clashes,
    finalClashes: receipt.final.clashes,
    baselineContacts: receipt.baseline.contactCount,
    finalContacts: receipt.final.contactCount,
    scoreDelta,
    clashDelta,
    contactDelta,
    contactDirection: direction,
    contactCountShortcutFalsified,
    prediction,
    predictionMatched: prediction === direction,
  });
}

export function lockContactTransferPrediction(
  state: Readonly<ContactTransferState>,
  prediction: CandidateContactPrediction,
): Readonly<ContactTransferState> {
  if (state.lockedPrediction || state.threeCeThreeViewedBeforeLock) return state;
  return Object.freeze({
    ...state,
    lockedPrediction: prediction,
    firstResult: null,
  });
}

export function recordThreeCeThreeExposure(
  state: Readonly<ContactTransferState>,
): Readonly<ContactTransferState> {
  if (state.lockedPrediction || state.threeCeThreeViewedBeforeLock) return state;
  return Object.freeze({ ...state, threeCeThreeViewedBeforeLock: true });
}

export function captureFirstContactTransferResult(
  state: Readonly<ContactTransferState>,
  receipt: LearningChallengeReceipt,
): Readonly<ContactTransferState> {
  if (!state.lockedPrediction || state.firstResult) return state;
  const result = deriveContactTransferResult(
    receipt,
    state.lockedPrediction,
  );
  return result
    ? Object.freeze({ ...state, firstResult: result })
    : state;
}

function formatScore(value: number): string {
  if (Math.abs(value) < 0.005) return "0.00";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;
}

function predictionLabel(prediction: CandidateContactPrediction): string {
  if (prediction === "increase") return "candidate markers increase";
  if (prediction === "decrease") return "candidate markers decrease";
  return "candidate markers stay unchanged";
}

export function ContactCountTransferLab({
  oneStpReceipt,
  threeCeThreeReceipt,
  activeTarget,
  transferState,
  onLockPrediction,
  onSelectTarget,
}: {
  oneStpReceipt?: LearningChallengeReceipt;
  threeCeThreeReceipt?: LearningChallengeReceipt;
  activeTarget: "1stp" | "3ce3";
  transferState: Readonly<ContactTransferState>;
  onLockPrediction: (prediction: CandidateContactPrediction) => void;
  onSelectTarget: (targetId: "3ce3") => void;
}) {
  const instanceId = useId();
  const [selectedPrediction, setSelectedPrediction] =
    useState<CandidateContactPrediction | null>(null);
  const canLockBlindPrediction = Boolean(
    oneStpReceipt &&
      !threeCeThreeReceipt &&
      !transferState.threeCeThreeViewedBeforeLock &&
      !transferState.lockedPrediction,
  );
  const waitingForTransferResult = Boolean(
    transferState.lockedPrediction && !transferState.firstResult,
  );
  const result = transferState.firstResult;

  if (!canLockBlindPrediction && !waitingForTransferResult && !result) {
    return null;
  }

  function lockPrediction() {
    if (!selectedPrediction || !canLockBlindPrediction) return;
    onLockPrediction(selectedPrediction);
    onSelectTarget("3ce3");
  }

  return (
    <section
      className={`contact-transfer-lab${result ? " is-result" : ""}`}
      aria-labelledby={`${instanceId}-title`}
      aria-describedby={`${instanceId}-boundary`}
    >
      <header className="contact-transfer-lab__header">
        <div>
          <span>Blind transfer lab</span>
          <h3 id={`${instanceId}-title`}>
            {result
              ? "The contact-count shortcut breaks."
              : "Predict the second target’s contact count."}
          </h3>
        </div>
        <span className="contact-transfer-lab__target">3CE3 · target-local</span>
      </header>

      {canLockBlindPrediction && (
        <form
          className="contact-transfer-lab__prediction"
          onSubmit={(event) => {
            event.preventDefault();
            lockPrediction();
          }}
        >
          <div className="contact-transfer-lab__prompt">
            <strong>Before the 3CE3 prepared pose is shown:</strong>
            <p>
              What will happen to its candidate-contact marker count? Lock one
              answer before opening the separate c-MET field.
            </p>
          </div>
          <fieldset>
            <legend className="sr-only">
              Predict the 3CE3 candidate-contact marker direction
            </legend>
            {PREDICTION_OPTIONS.map((option) => {
              const inputId = `${instanceId}-${option.id}`;
              return (
                <label key={option.id} htmlFor={inputId}>
                  <input
                    id={inputId}
                    type="radio"
                    name={`${instanceId}-contact-prediction`}
                    value={option.id}
                    checked={selectedPrediction === option.id}
                    onChange={() => setSelectedPrediction(option.id)}
                  />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.detail}</small>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <button type="submit" disabled={!selectedPrediction}>
            Lock prediction and open 3CE3
          </button>
        </form>
      )}

      {waitingForTransferResult && transferState.lockedPrediction && (
        <div className="contact-transfer-lab__locked">
          <div role="status" aria-live="polite" aria-atomic="true">
            <span>First answer locked</span>
            <strong>{predictionLabel(transferState.lockedPrediction)}</strong>
            <p>
              Complete the exact reset → reveal → explain task for 3CE3. This
              first prediction cannot be replaced by a rerun.
            </p>
          </div>
          {activeTarget !== "3ce3" && (
            <button type="button" onClick={() => onSelectTarget("3ce3")}>
              Open 3CE3
            </button>
          )}
        </div>
      )}

      {result && (
        <div className="contact-transfer-lab__result" aria-live="polite">
          <div className="contact-transfer-lab__verdict">
            <span>
              {result.predictionMatched
                ? "Blind prediction matched"
                : "Counterexample observed"}
            </span>
            <strong>
              Candidate markers fell while the target-local score improved.
            </strong>
            <p>
              The geometric marker count does not determine the AutoGrid score.
              Atom-type maps, electrostatics, and desolvation are scored on a
              separate target-specific field.
            </p>
          </div>
          <dl>
            <div>
              <dt>Local score</dt>
              <dd>
                {formatScore(result.baselineScore)} → {formatScore(result.finalScore)}
              </dd>
            </div>
            <div>
              <dt>Overlap flags</dt>
              <dd>
                {result.baselineClashes} → {result.finalClashes}
              </dd>
            </div>
            <div>
              <dt>Candidate markers</dt>
              <dd>
                {result.baselineContacts} → {result.finalContacts}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <p id={`${instanceId}-boundary`} className="contact-transfer-lab__boundary">
        One blind, single-session transfer check in open-page memory. It is not
        a mastery score, learning-efficacy result, affinity comparison, or
        clinical validation. Candidate markers never enter the AutoGrid total.
      </p>
    </section>
  );
}
