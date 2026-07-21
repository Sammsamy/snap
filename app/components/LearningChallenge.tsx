"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import "./learning-challenge.css";

export interface LearningChallengeContact {
  id?: string;
  residue: string;
  distance?: number;
}

export interface LearningChallengeSnapshot {
  score: number;
  clashes: number;
  contactCount: number;
  contacts: string[];
}

export type LearningChallengePoseState =
  | "unavailable"
  | "challenge"
  | "free"
  | "revealing"
  | "reference";

export type LearningPrediction =
  | "lower-score-fewer-clashes"
  | "lower-score-not-fewer-clashes"
  | "not-lower-score-fewer-clashes"
  | "not-lower-score-not-fewer-clashes";

export type LearningExplanation =
  | "prepared-model-comparison"
  | "clinical-affinity-proof"
  | "drug-discovery-proof";

export interface LearningObservation {
  scoreDelta: number;
  clashDelta: number;
  contactDelta: number;
  scoreDirection: "lower" | "not-lower";
  clashDirection: "fewer" | "not-fewer";
  predictionOutcome: LearningPrediction;
}

export interface LearningChallengeReceipt {
  schemaVersion: "1.1";
  assessment: "snap-controlled-predict-reveal-explain";
  completedAt: string;
  path: {
    baselinePose: "exact-15-degree-reset-challenge";
    gradedAction: "reveal-pdb-pose";
    finalPose: "locked-pdb-reference";
  };
  pre: {
    answer: LearningPrediction;
    observedOutcome: LearningPrediction;
    correct: boolean;
  };
  baseline: LearningChallengeSnapshot;
  observation: LearningObservation;
  final: LearningChallengeSnapshot;
  controlledPathInvariantMet: boolean;
  post: {
    answer: LearningExplanation;
    correct: boolean;
  };
  correctChecks: number;
  totalChecks: 2;
  scope: "Single-session task receipt only; it does not demonstrate learning efficacy, clinical validation, or population outcomes, and it is not stored.";
}

export interface LearningChallengeProps {
  currentScore: number | null;
  contacts: readonly LearningChallengeContact[];
  candidateContactCount?: number | null;
  clashes: number | null;
  poseState: LearningChallengePoseState;
  onResetChallengePose: () => void;
  onRevealReferencePose: () => void;
  onComplete?: (receipt: LearningChallengeReceipt) => void;
  isReadoutValid?: boolean;
  className?: string;
}

type ChallengeStep = "predict" | "act" | "explain" | "receipt";

const SCORE_DIRECTION_EPSILON = 0.01;
const EXPECTED_CONTROLLED_OUTCOME: LearningPrediction =
  "lower-score-fewer-clashes";
const CORRECT_EXPLANATION: LearningExplanation =
  "prepared-model-comparison";

const PREDICTION_OPTIONS: readonly {
  id: LearningPrediction;
  title: string;
  detail: string;
}[] = [
  {
    id: "lower-score-fewer-clashes",
    title: "A lower score, with fewer clashes",
    detail: "The prepared field becomes more favorable while steric overlaps clear.",
  },
  {
    id: "lower-score-not-fewer-clashes",
    title: "A lower score, without fewer clashes",
    detail: "The score falls, but the clash count stays level or rises.",
  },
  {
    id: "not-lower-score-fewer-clashes",
    title: "No lower score, but fewer clashes",
    detail: "Steric overlaps clear while the score stays level or rises.",
  },
  {
    id: "not-lower-score-not-fewer-clashes",
    title: "No improvement in either readout",
    detail: "The score does not fall and the clash count does not decrease.",
  },
];

const EXPLANATION_OPTIONS: readonly {
  id: LearningExplanation;
  title: string;
  detail: string;
}[] = [
  {
    id: "prepared-model-comparison",
    title: "The readout compares two prepared poses in this local model",
    detail:
      "The observed score, clashes, and candidate contacts explain this rigid comparison without claiming predictive affinity.",
  },
  {
    id: "clinical-affinity-proof",
    title: "The result proves clinical binding affinity",
    detail: "One rigid score establishes how the molecule behaves in patients.",
  },
  {
    id: "drug-discovery-proof",
    title: "The instrument discovered a new drug",
    detail: "Matching a known experimental pose is equivalent to screening and validation.",
  },
];

function roundToHundredth(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function captureLearningSnapshot(
  score: number | null,
  contacts: readonly LearningChallengeContact[],
  clashes: number | null,
  candidateContactCount?: number | null,
): LearningChallengeSnapshot | null {
  if (!Number.isFinite(score) || !Number.isFinite(clashes)) return null;

  return {
    score: score as number,
    clashes: Math.max(0, Math.trunc(clashes as number)),
    contactCount: Number.isFinite(candidateContactCount)
      ? Math.max(0, Math.trunc(candidateContactCount as number))
      : contacts.length,
    contacts: contacts.map((contact) => {
      const residue = contact.residue.trim() || "Unnamed residue";
      return Number.isFinite(contact.distance)
        ? `${residue} · ${(contact.distance as number).toFixed(2)} Å`
        : residue;
    }),
  };
}

export function compareLearningSnapshots(
  baseline: LearningChallengeSnapshot,
  final: LearningChallengeSnapshot,
): LearningObservation {
  const scoreDelta = roundToHundredth(final.score - baseline.score);
  const clashDelta = final.clashes - baseline.clashes;
  const contactDelta = final.contactCount - baseline.contactCount;
  const scoreDirection =
    scoreDelta < -SCORE_DIRECTION_EPSILON ? "lower" : "not-lower";
  const clashDirection = clashDelta < 0 ? "fewer" : "not-fewer";
  const predictionOutcome: LearningPrediction =
    scoreDirection === "lower"
      ? clashDirection === "fewer"
        ? "lower-score-fewer-clashes"
        : "lower-score-not-fewer-clashes"
      : clashDirection === "fewer"
        ? "not-lower-score-fewer-clashes"
        : "not-lower-score-not-fewer-clashes";

  return {
    scoreDelta,
    clashDelta,
    contactDelta,
    scoreDirection,
    clashDirection,
    predictionOutcome,
  };
}

export function createLearningReceipt(
  prediction: LearningPrediction,
  explanation: LearningExplanation,
  baseline: LearningChallengeSnapshot,
  final: LearningChallengeSnapshot,
  completedAt = new Date().toISOString(),
): LearningChallengeReceipt {
  const observation = compareLearningSnapshots(baseline, final);
  const preCorrect = prediction === observation.predictionOutcome;
  const postCorrect = explanation === CORRECT_EXPLANATION;

  return {
    schemaVersion: "1.1",
    assessment: "snap-controlled-predict-reveal-explain",
    completedAt,
    path: {
      baselinePose: "exact-15-degree-reset-challenge",
      gradedAction: "reveal-pdb-pose",
      finalPose: "locked-pdb-reference",
    },
    pre: {
      answer: prediction,
      observedOutcome: observation.predictionOutcome,
      correct: preCorrect,
    },
    baseline,
    observation,
    final,
    controlledPathInvariantMet:
      observation.predictionOutcome === EXPECTED_CONTROLLED_OUTCOME,
    post: { answer: explanation, correct: postCorrect },
    correctChecks: Number(preCorrect) + Number(postCorrect),
    totalChecks: 2,
    scope:
      "Single-session task receipt only; it does not demonstrate learning efficacy, clinical validation, or population outcomes, and it is not stored.",
  };
}

function formatScore(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatDelta(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;
}

export function LearningChallenge({
  currentScore,
  contacts,
  candidateContactCount,
  clashes,
  poseState,
  onResetChallengePose,
  onRevealReferencePose,
  onComplete,
  isReadoutValid = true,
  className = "",
}: LearningChallengeProps) {
  const instanceId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasMounted = useRef(false);
  const [step, setStep] = useState<ChallengeStep>("predict");
  const [prediction, setPrediction] = useState<LearningPrediction | null>(null);
  const [explanation, setExplanation] = useState<LearningExplanation | null>(null);
  const [baseline, setBaseline] = useState<LearningChallengeSnapshot | null>(null);
  const [finalSnapshot, setFinalSnapshot] = useState<LearningChallengeSnapshot | null>(null);
  const [receipt, setReceipt] = useState<LearningChallengeReceipt | null>(null);
  const [revealRequested, setRevealRequested] = useState(false);

  const currentSnapshot = useMemo(
    () =>
      captureLearningSnapshot(
        currentScore,
        contacts,
        clashes,
        candidateContactCount,
      ),
    [candidateContactCount, clashes, contacts, currentScore],
  );
  const metricsReady = Boolean(currentSnapshot && isReadoutValid);
  const baselineReady = poseState === "challenge" && metricsReady;
  const revealCompleted = Boolean(
    revealRequested &&
      poseState === "reference" &&
      currentSnapshot &&
      isReadoutValid,
  );
  const pathCompromised =
    step === "act" &&
    (revealRequested
      ? poseState !== "challenge" &&
        poseState !== "revealing" &&
        poseState !== "reference"
      : poseState !== "challenge");
  const visibleStep =
    step === "receipt" ? 3 : step === "predict" ? 1 : step === "act" ? 2 : 3;

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  function requestChallengeReset() {
    onResetChallengePose();
  }

  function submitPrediction() {
    if (!prediction || !currentSnapshot || !baselineReady) return;
    setBaseline(currentSnapshot);
    setStep("act");
  }

  function requestReferencePose() {
    if (poseState !== "challenge" || revealRequested || pathCompromised) return;
    setRevealRequested(true);
    onRevealReferencePose();
  }

  function captureControlledObservation() {
    if (!currentSnapshot || !revealCompleted || pathCompromised) return;
    setFinalSnapshot(currentSnapshot);
    setStep("explain");
  }

  function submitExplanation() {
    if (!prediction || !explanation || !baseline || !finalSnapshot) return;
    const nextReceipt = createLearningReceipt(
      prediction,
      explanation,
      baseline,
      finalSnapshot,
    );
    setReceipt(nextReceipt);
    setStep("receipt");
    onComplete?.(nextReceipt);
  }

  function restartChallenge() {
    setStep("predict");
    setPrediction(null);
    setExplanation(null);
    setBaseline(null);
    setFinalSnapshot(null);
    setReceipt(null);
    setRevealRequested(false);
    onResetChallengePose();
  }

  const observation = receipt?.observation;

  return (
    <section
      className={`learning-challenge ${className}`.trim()}
      aria-labelledby={`${instanceId}-title`}
    >
      <header className="learning-challenge__header">
        <div>
          <span className="learning-challenge__index">03 / LEARN</span>
          <h2 id={`${instanceId}-title`}>Can you read the fit?</h2>
          <p>
            Predict one controlled comparison. Reveal the known pose. Explain only what the local evidence supports.
          </p>
        </div>
        <div className="learning-challenge__progress-wrap">
          <span aria-live="polite">Step {visibleStep} of 3</span>
          <ol className="learning-challenge__progress" aria-label="Assessment progress">
            {[1, 2, 3].map((number) => (
              <li
                key={number}
                className={number < visibleStep ? "is-complete" : number === visibleStep ? "is-current" : ""}
                aria-current={number === visibleStep ? "step" : undefined}
              >
                <span>{number}</span>
              </li>
            ))}
          </ol>
        </div>
      </header>

      <div className="learning-challenge__path-seal" aria-label="Controlled assessment path">
        <span>Exact 15° reset pose</span>
        <i aria-hidden="true">→</i>
        <span>Reveal PDB pose</span>
        <i aria-hidden="true">→</i>
        <span>Locked reference readout</span>
      </div>

      <div className="learning-challenge__body">
        {step === "predict" && (
          <div className="learning-challenge__step">
            <div className="learning-challenge__prompt">
              <span>01 · Predict</span>
              <h3 ref={headingRef} tabIndex={-1}>
                What will the PDB pose change?
              </h3>
              <p>
                The baseline is captured only when SNAP reports the exact reset challenge pose. Free-move data is excluded.
              </p>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitPrediction();
              }}
            >
              <fieldset className="learning-challenge__choices" disabled={!baselineReady}>
                <legend className="sr-only">Predict the controlled result</legend>
                {PREDICTION_OPTIONS.map((option) => {
                  const inputId = `${instanceId}-prediction-${option.id}`;
                  return (
                    <label key={option.id} className="learning-challenge__choice" htmlFor={inputId}>
                      <input
                        id={inputId}
                        type="radio"
                        name={`${instanceId}-prediction`}
                        value={option.id}
                        checked={prediction === option.id}
                        onChange={() => setPrediction(option.id)}
                      />
                      <span>
                        <strong>{option.title}</strong>
                        <small>{option.detail}</small>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              <div className="learning-challenge__action-row">
                {baselineReady ? (
                  <ReadoutStrip snapshot={currentSnapshot} label="Exact reset baseline" />
                ) : (
                  <button
                    className="learning-challenge__secondary"
                    type="button"
                    onClick={requestChallengeReset}
                  >
                    Load exact challenge pose
                  </button>
                )}
                <button
                  className="learning-challenge__primary"
                  type="submit"
                  disabled={!prediction || !baselineReady}
                >
                  Lock prediction
                </button>
              </div>
              <p className="learning-challenge__status" role="status">
                {baselineReady
                  ? "Exact challenge pose confirmed. This readout can be the controlled baseline."
                  : poseState === "challenge"
                    ? "Waiting for a valid readout at the exact reset challenge pose."
                    : "Reset is required before a baseline can be graded."}
              </p>
            </form>
          </div>
        )}

        {step === "act" && baseline && (
          <div className="learning-challenge__step">
            <div className="learning-challenge__prompt">
              <span>02 · Act</span>
              <h3 ref={headingRef} tabIndex={-1}>
                Run the controlled reveal.
              </h3>
              <p>
                Reveal is the only graded action. Intermediate animation frames and freely moved poses are never captured.
              </p>
            </div>

            {pathCompromised ? (
              <div className="learning-challenge__path-error" role="alert">
                <strong>Controlled path interrupted</strong>
                <p>
                  The pose left the permitted reset → reveal → reference sequence. Restart to prevent free-move data from entering the grade.
                </p>
                <button className="learning-challenge__secondary" type="button" onClick={restartChallenge}>
                  Restart controlled trial
                </button>
              </div>
            ) : (
              <div>
                <div className="learning-challenge__compare" aria-live="polite">
                  <ReadoutStrip snapshot={baseline} label="Reset baseline" />
                  <span className="learning-challenge__compare-mark" aria-hidden="true">→</span>
                  <ReadoutStrip
                    snapshot={revealCompleted ? currentSnapshot : null}
                    label="Locked reference"
                  />
                </div>

                <div className="learning-challenge__act-grid">
                  <button
                    className="learning-challenge__secondary"
                    type="button"
                    onClick={requestReferencePose}
                    disabled={revealRequested || poseState !== "challenge"}
                  >
                    {poseState === "revealing"
                      ? "Reveal in progress…"
                      : revealRequested
                        ? "PDB pose revealed"
                        : "Reveal PDB pose"}
                  </button>
                  <button
                    className="learning-challenge__primary"
                    type="button"
                    onClick={captureControlledObservation}
                    disabled={!revealCompleted}
                  >
                    Capture controlled result
                  </button>
                </div>

                <p className="learning-challenge__status" role="status">
                  {poseState === "revealing"
                    ? "Reveal transition observed. Capture remains locked until the reference pose is complete."
                    : revealCompleted
                      ? "Locked PDB reference confirmed. The controlled result is ready to capture."
                      : revealRequested
                        ? "Waiting for SNAP to confirm the locked PDB reference pose."
                        : "Run Reveal PDB pose to produce the only gradable result."}
                </p>
              </div>
            )}
          </div>
        )}

        {step === "explain" && baseline && finalSnapshot && (
          <div className="learning-challenge__step">
            <div className="learning-challenge__prompt">
              <span>03 · Explain</span>
              <h3 ref={headingRef} tabIndex={-1}>
                What can this observation honestly support?
              </h3>
              <p>
                Separate a transparent pose comparison from claims this instrument does not test.
              </p>
            </div>

            <div>
              <div className="learning-challenge__observation">
                <span>Controlled observation</span>
                <strong>
                  Score {compareLearningSnapshots(baseline, finalSnapshot).scoreDirection === "lower" ? "fell" : "did not fall"}; clashes {compareLearningSnapshots(baseline, finalSnapshot).clashDirection === "fewer" ? "decreased" : "did not decrease"}.
                </strong>
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitExplanation();
                }}
              >
                <fieldset className="learning-challenge__choices">
                  <legend className="sr-only">Choose the supported explanation</legend>
                  {EXPLANATION_OPTIONS.map((option) => {
                    const inputId = `${instanceId}-explanation-${option.id}`;
                    return (
                      <label key={option.id} className="learning-challenge__choice" htmlFor={inputId}>
                        <input
                          id={inputId}
                          type="radio"
                          name={`${instanceId}-explanation`}
                          value={option.id}
                          checked={explanation === option.id}
                          onChange={() => setExplanation(option.id)}
                        />
                        <span>
                          <strong>{option.title}</strong>
                          <small>{option.detail}</small>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
                <div className="learning-challenge__action-row learning-challenge__action-row--end">
                  <span className="learning-challenge__scope">No API · no storage · one controlled session</span>
                  <button
                    className="learning-challenge__primary"
                    type="submit"
                    disabled={!explanation}
                  >
                    Grade explanation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {step === "receipt" && receipt && observation && (
          <div className="learning-challenge__step learning-challenge__step--receipt">
            <div className="learning-challenge__prompt">
              <span>Local task receipt</span>
              <h3 ref={headingRef} tabIndex={-1}>
                {receipt.correctChecks} of 2 reasoning checks matched
              </h3>
              <p>
                This records one controlled browser task. It does not demonstrate learning efficacy.
              </p>
            </div>

            <div>
              <div className="learning-challenge__receipt-grid">
                <article className={receipt.pre.correct ? "is-correct" : "is-review"}>
                  <span>Pre · prediction</span>
                  <strong>{receipt.pre.correct ? "Matched result" : "Did not match"}</strong>
                  <p>
                    Graded against the observed score and clash directions, not an assumed answer.
                  </p>
                </article>
                <article className="learning-challenge__receipt-delta">
                  <span>Act · observed</span>
                  <strong>{formatDelta(observation.scoreDelta)} score</strong>
                  <p>
                    {formatScore(receipt.baseline.score)} → {formatScore(receipt.final.score)} · {observation.clashDelta > 0 ? "+" : ""}{observation.clashDelta} clashes · {observation.contactDelta > 0 ? "+" : ""}{observation.contactDelta} contacts
                  </p>
                </article>
                <article className={receipt.post.correct ? "is-correct" : "is-review"}>
                  <span>Post · explanation</span>
                  <strong>{receipt.post.correct ? "Supported" : "Overclaimed"}</strong>
                  <p>
                    The result compares prepared poses locally; it does not establish clinical affinity or discovery.
                  </p>
                </article>
              </div>

              <div className="learning-challenge__receipt-footer">
                <div>
                  <span>Controlled-path check</span>
                  <p>
                    {receipt.controlledPathInvariantMet
                      ? "Expected contrast reproduced: the PDB pose scored lower with fewer clashes."
                      : "The observed contrast differed from the expected control; the actual deltas above are retained."}
                  </p>
                </div>
                <button className="learning-challenge__secondary" type="button" onClick={restartChallenge}>
                  Run it again
                </button>
              </div>

              <p className="learning-challenge__receipt-scope">
                Exact reset baseline → Reveal PDB pose → locked reference. Generated locally and not stored. This receipt is not learning-efficacy, clinical-validation, or population evidence.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ReadoutStrip({
  snapshot,
  label,
}: {
  snapshot: LearningChallengeSnapshot | null;
  label: string;
}) {
  return (
    <div className="learning-challenge__readout" aria-label={label}>
      <span>{label}</span>
      {snapshot ? (
        <dl>
          <div>
            <dt>Score</dt>
            <dd>{formatScore(snapshot.score)}</dd>
          </div>
          <div>
            <dt>Clashes</dt>
            <dd>{snapshot.clashes}</dd>
          </div>
          <div>
            <dt>Contacts</dt>
            <dd>{snapshot.contactCount}</dd>
          </div>
        </dl>
      ) : (
        <strong>Waiting for valid locked readout</strong>
      )}
    </div>
  );
}
