"use client";

import { useId } from "react";
import type { LearningChallengeReceipt } from "./LearningChallenge";
import "./two-target-observation-record.css";

export type ObservationTargetId = "1stp" | "3ce3";

export interface TargetObservation {
  targetId: ObservationTargetId;
  contextLabel: string;
  receipt: LearningChallengeReceipt;
}

export type TwoTargetObservations = Partial<
  Record<ObservationTargetId, TargetObservation>
>;

export interface TwoTargetObservationRecordProps {
  observations: TwoTargetObservations;
  activeTarget: ObservationTargetId;
  onSelectTarget: (targetId: ObservationTargetId) => void;
}

interface TargetLocalOutcome {
  score: "Score fell" | "Score did not fall";
  overlaps: "Overlap flags decreased" | "Overlap flags did not decrease";
  candidateMarkers: string;
}

const TARGET_ORDER: readonly ObservationTargetId[] = ["1stp", "3ce3"];

const TARGET_LABELS: Record<
  ObservationTargetId,
  { entryId: string; contextLabel: string; continuationLabel: string }
> = {
  "1stp": {
    entryId: "1STP",
    contextLabel: "Streptavidin · biotin",
    continuationLabel: "1STP, streptavidin and biotin",
  },
  "3ce3": {
    entryId: "3CE3",
    contextLabel: "c-MET · experimental inhibitor 1FN",
    continuationLabel: "3CE3, c-MET and experimental inhibitor 1FN",
  },
};

function observationForTarget(
  observations: TwoTargetObservations,
  targetId: ObservationTargetId,
): TargetObservation | undefined {
  const observation = observations[targetId];
  return observation?.targetId === targetId ? observation : undefined;
}

function formatCandidateMarkerDelta(delta: number): string {
  if (delta > 0) return `Candidate markers changed +${delta}`;
  if (delta < 0) return `Candidate markers changed −${Math.abs(delta)}`;
  return "Candidate markers did not change (0)";
}

export function summarizeTargetLocalOutcome(
  receipt: LearningChallengeReceipt,
): TargetLocalOutcome {
  return {
    score:
      receipt.observation.scoreDirection === "lower"
        ? "Score fell"
        : "Score did not fall",
    overlaps:
      receipt.observation.clashDirection === "fewer"
        ? "Overlap flags decreased"
        : "Overlap flags did not decrease",
    candidateMarkers: formatCandidateMarkerDelta(
      receipt.observation.contactDelta,
    ),
  };
}

/**
 * Use from a functional state update so the named target is replaced without
 * reading or mutating a stale observations object.
 */
export function upsertTargetObservation(
  observations: TwoTargetObservations,
  targetId: ObservationTargetId,
  contextLabel: string,
  receipt: LearningChallengeReceipt,
): TwoTargetObservations {
  return {
    ...observations,
    [targetId]: {
      targetId,
      contextLabel,
      receipt,
    },
  };
}

export function TwoTargetObservationRecord({
  observations,
  activeTarget,
  onSelectTarget,
}: TwoTargetObservationRecordProps) {
  const instanceId = useId();
  const observedTargets = TARGET_ORDER.filter((targetId) =>
    observationForTarget(observations, targetId),
  );

  if (observedTargets.length === 0) return null;

  const incompleteTarget = TARGET_ORDER.find(
    (targetId) => !observationForTarget(observations, targetId),
  );

  return (
    <section
      className="two-target-observation-record"
      aria-labelledby={`${instanceId}-title`}
      aria-describedby={`${instanceId}-boundary`}
    >
      <header className="two-target-observation-record__header">
        <div>
          <span className="two-target-observation-record__eyebrow">
            Open-page record
          </span>
          <h2 id={`${instanceId}-title`}>Two-target observation record</h2>
          <p>
            One controlled task receipt for each prepared target-specific field.
          </p>
        </div>
        <p
          className="two-target-observation-record__progress"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {observedTargets.length} of 2 targets observed
        </p>
      </header>

      <ul
        className="two-target-observation-record__systems"
        aria-label="Prepared target observation status"
      >
        {TARGET_ORDER.map((targetId) => {
          const labels = TARGET_LABELS[targetId];
          const observation = observationForTarget(observations, targetId);
          const outcome = observation
            ? summarizeTargetLocalOutcome(observation.receipt)
            : null;
          const contextLabel = observation?.contextLabel || labels.contextLabel;
          const headingId = `${instanceId}-${targetId}-title`;

          return (
            <li key={targetId}>
              <article
                className={`two-target-observation-record__system${
                  observation ? " is-observed" : " is-unobserved"
                }${activeTarget === targetId ? " is-active" : ""}`}
                aria-labelledby={headingId}
                aria-current={activeTarget === targetId ? "true" : undefined}
              >
                <div className="two-target-observation-record__system-header">
                  <div>
                    <span>{labels.entryId}</span>
                    <h3 id={headingId}>{contextLabel}</h3>
                  </div>
                  <span className="two-target-observation-record__state">
                    <i aria-hidden="true" />
                    {observation ? "Observed" : "Not observed"}
                  </span>
                </div>

                {activeTarget === targetId && (
                  <p className="two-target-observation-record__active-label">
                    Current target
                  </p>
                )}

                {observation && outcome ? (
                  <dl className="two-target-observation-record__metrics">
                    <div>
                      <dt>Task responses</dt>
                      <dd>
                        {observation.receipt.correctChecks} of {observation.receipt.totalChecks} matched
                      </dd>
                    </div>
                    <div>
                      <dt>Target-local score</dt>
                      <dd>{outcome.score} in this prepared field</dd>
                    </div>
                    <div>
                      <dt>Overlap flags</dt>
                      <dd>{outcome.overlaps}</dd>
                    </div>
                    <div>
                      <dt>Candidate markers</dt>
                      <dd>{outcome.candidateMarkers}</dd>
                    </div>
                  </dl>
                ) : (
                  <dl className="two-target-observation-record__metrics">
                    <div>
                      <dt>Observation</dt>
                      <dd>No controlled task receipt on this page yet.</dd>
                    </div>
                  </dl>
                )}
              </article>
            </li>
          );
        })}
      </ul>

      <footer className="two-target-observation-record__footer">
        <p id={`${instanceId}-boundary`}>
          Open-page memory only; this record clears on refresh. It is not
          evidence of learning efficacy, competence, drug efficacy, or clinical
          validation. Target-specific scores are never combined, ranked, or
          compared.
        </p>
        {incompleteTarget && (
          <button
            type="button"
            onClick={() => onSelectTarget(incompleteTarget)}
            aria-label={`Continue with ${TARGET_LABELS[incompleteTarget].continuationLabel}`}
          >
            Continue with {TARGET_LABELS[incompleteTarget].entryId}
          </button>
        )}
      </footer>
    </section>
  );
}
