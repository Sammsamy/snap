import {
  AUTOGRID_MODEL_NAME,
  type AutoGridAtomScore,
  type AutoGridScoreBreakdown,
} from "./scoring";

export const CONTRIBUTION_LENS_MODEL =
  "SNAP AutoGrid atom contribution lens v1" as const;
export const TOP_CONTRIBUTION_COUNT = 3 as const;
export const DEFAULT_NEUTRAL_DELTA = 0.005;

/**
 * AutoGrid values are rounded independently to 12 significant digits by the
 * scorer. Conservation therefore needs a small scale-aware numerical bound.
 */
export const CONSERVATION_ABSOLUTE_TOLERANCE_PER_ATOM = 1e-9;
export const CONSERVATION_RELATIVE_TOLERANCE = 1e-10;

export const CONTRIBUTION_LENS_SCOPE =
  "Target-specific rigid-pose AutoGrid contribution changes. These values are not residue-level energies, binding affinity, or cross-target comparisons." as const;

export type ContributionTerm = "affinity" | "electrostatics" | "desolvation";
export type ContributionTone = "favorable" | "neutral" | "unfavorable";

export interface ContributionTermValues {
  readonly affinity: number;
  readonly electrostatics: number;
  readonly desolvation: number;
}

export interface ContributionToneStyle {
  /** Text must accompany color so the mapping is not color-only. */
  readonly label: string;
  readonly colorName: "cyan" | "slate" | "coral";
  /** High-contrast foreground colors intended for SNAP's near-black canvas. */
  readonly hex: `#${string}`;
}

export const CONTRIBUTION_TONE_STYLES: Readonly<
  Record<ContributionTone, Readonly<ContributionToneStyle>>
> = Object.freeze({
  favorable: Object.freeze({
    label: "More favorable",
    colorName: "cyan",
    hex: "#67E8F9",
  }),
  neutral: Object.freeze({
    label: "Little or no displayed change",
    colorName: "slate",
    hex: "#CBD5E1",
  }),
  unfavorable: Object.freeze({
    label: "Less favorable",
    colorName: "coral",
    hex: "#FDA4AF",
  }),
});

export const CONTRIBUTION_TERM_LABELS: Readonly<
  Record<ContributionTerm, string>
> = Object.freeze({
  affinity: "Atom-type affinity",
  electrostatics: "Electrostatics",
  desolvation: "Desolvation",
});

export interface ScopedAutoGridScore {
  /** Both compared poses must name the same immutable prepared system. */
  readonly systemId: string;
  readonly poseLabel: string;
  readonly score: AutoGridScoreBreakdown;
}

export interface AtomContributionState extends ContributionTermValues {
  readonly total: number;
}

export interface AtomContributionDelta {
  /** Original ligand-atom order; also serves as the stable ranking tie-break. */
  readonly atomIndex: number;
  readonly atomId: string;
  readonly mapType: string;
  readonly baseline: Readonly<AtomContributionState>;
  readonly current: Readonly<AtomContributionState>;
  /** Current minus baseline. Negative is more favorable within this field. */
  readonly delta: Readonly<AtomContributionState>;
  readonly absoluteTotalDelta: number;
  readonly tone: ContributionTone;
  readonly style: Readonly<ContributionToneStyle>;
}

export interface ContributionConservation {
  readonly tolerance: number;
  readonly atomSumDelta: Readonly<AtomContributionState>;
  /** atom-sum delta minus the exact score-breakdown delta. */
  readonly residual: Readonly<AtomContributionState>;
  readonly invariantMet: true;
}

export interface ContributionLensResult {
  readonly model: typeof CONTRIBUTION_LENS_MODEL;
  readonly scope: typeof CONTRIBUTION_LENS_SCOPE;
  readonly systemId: string;
  readonly baselinePoseLabel: string;
  readonly currentPoseLabel: string;
  readonly direction: "current-minus-baseline";
  readonly atomCount: number;
  /** Exact subtraction of the two scorer-owned aggregate breakdowns. */
  readonly termDelta: Readonly<ContributionTermValues>;
  readonly totalDelta: number;
  readonly tone: ContributionTone;
  readonly style: Readonly<ContributionToneStyle>;
  readonly contributions: readonly Readonly<AtomContributionDelta>[];
  readonly topContributors: readonly Readonly<AtomContributionDelta>[];
  readonly conservation: Readonly<ContributionConservation>;
}

export interface ContributionLensOptions {
  /** Half a displayed hundredth by default, preventing a visible "-0.00" tone. */
  readonly neutralDelta?: number;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new TypeError(`${label} must be non-empty.`);
}

function compensatedSum(values: readonly number[]): number {
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const next = sum + value;
    correction +=
      Math.abs(sum) >= Math.abs(value)
        ? sum - next + value
        : value - next + sum;
    sum = next;
  }
  return sum + correction;
}

function toleranceFor(
  atomCount: number,
  ...values: readonly number[]
): number {
  const scale = Math.max(1, ...values.map((value) => Math.abs(value)));
  return (
    atomCount * CONSERVATION_ABSOLUTE_TOLERANCE_PER_ATOM +
    scale * CONSERVATION_RELATIVE_TOLERANCE
  );
}

function assertApproximatelyEqual(
  actual: number,
  expected: number,
  atomCount: number,
  label: string,
): void {
  const tolerance = toleranceFor(atomCount, actual, expected);
  if (Math.abs(actual - expected) > tolerance) {
    throw new RangeError(
      `${label} violates contribution conservation: expected ${expected}, ` +
        `received ${actual} (tolerance ${tolerance}).`,
    );
  }
}

function termsForAtom(atom: AutoGridAtomScore): AtomContributionState {
  return Object.freeze({
    affinity: atom.affinity,
    electrostatics: atom.electrostatics,
    desolvation: atom.desolvation,
    total: atom.total,
  });
}

function validateAtom(atom: AutoGridAtomScore, index: number, label: string): void {
  assertNonEmpty(atom.atomId, `${label}.atomScores[${index}].atomId`);
  assertNonEmpty(atom.mapType, `${label}.atomScores[${index}].mapType`);
  for (const [term, value] of Object.entries({
    affinity: atom.affinity,
    electrostatics: atom.electrostatics,
    desolvation: atom.desolvation,
    total: atom.total,
    positionX: atom.position.x,
    positionY: atom.position.y,
    positionZ: atom.position.z,
  })) {
    assertFinite(value, `${label}.atomScores[${index}].${term}`);
  }
  if (atom.outsideGrid) {
    throw new RangeError(`${label}.atomScores[${index}] is outside the AutoGrid.`);
  }
  assertApproximatelyEqual(
    atom.affinity + atom.electrostatics + atom.desolvation,
    atom.total,
    1,
    `${label}.atomScores[${index}].total`,
  );
}

function validateScore(input: ScopedAutoGridScore, label: string): void {
  assertNonEmpty(input.systemId, `${label}.systemId`);
  assertNonEmpty(input.poseLabel, `${label}.poseLabel`);
  if (input.score.model !== AUTOGRID_MODEL_NAME) {
    throw new TypeError(`${label}.score must come from ${AUTOGRID_MODEL_NAME}.`);
  }
  if (!input.score.atomScores.length) {
    throw new RangeError(`${label}.score.atomScores must not be empty.`);
  }
  for (const [term, value] of Object.entries({
    affinity: input.score.terms.affinity,
    electrostatics: input.score.terms.electrostatics,
    desolvation: input.score.terms.desolvation,
    outsideGridPenalty: input.score.terms.outsideGridPenalty,
    total: input.score.total,
    outsideGridAtoms: input.score.outsideGridAtoms,
  })) {
    assertFinite(value, `${label}.score.${term}`);
  }
  if (!Number.isInteger(input.score.outsideGridAtoms)) {
    throw new TypeError(`${label}.score.outsideGridAtoms must be an integer.`);
  }
  if (input.score.outsideGridAtoms !== 0) {
    throw new RangeError(`${label}.score contains outside-grid atoms.`);
  }
  if (input.score.terms.outsideGridPenalty !== 0) {
    throw new RangeError(`${label}.score has a non-zero outside-grid penalty.`);
  }

  const ids = new Set<string>();
  input.score.atomScores.forEach((atom, index) => {
    validateAtom(atom, index, label);
    if (ids.has(atom.atomId)) {
      throw new TypeError(`${label}.score contains duplicate atom id ${atom.atomId}.`);
    }
    ids.add(atom.atomId);
  });

  const count = input.score.atomScores.length;
  const summedAffinity = compensatedSum(
    input.score.atomScores.map((atom) => atom.affinity),
  );
  const summedElectrostatics = compensatedSum(
    input.score.atomScores.map((atom) => atom.electrostatics),
  );
  const summedDesolvation = compensatedSum(
    input.score.atomScores.map((atom) => atom.desolvation),
  );
  const summedTotal = compensatedSum(
    input.score.atomScores.map((atom) => atom.total),
  );
  assertApproximatelyEqual(
    summedAffinity,
    input.score.terms.affinity,
    count,
    `${label}.score affinity sum`,
  );
  assertApproximatelyEqual(
    summedElectrostatics,
    input.score.terms.electrostatics,
    count,
    `${label}.score electrostatics sum`,
  );
  assertApproximatelyEqual(
    summedDesolvation,
    input.score.terms.desolvation,
    count,
    `${label}.score desolvation sum`,
  );
  assertApproximatelyEqual(
    summedTotal,
    input.score.total,
    count,
    `${label}.score atom-total sum`,
  );
  assertApproximatelyEqual(
    input.score.terms.affinity +
      input.score.terms.electrostatics +
      input.score.terms.desolvation,
    input.score.total,
    count,
    `${label}.score aggregate total`,
  );
}

export function contributionToneForDelta(
  delta: number,
  neutralDelta = DEFAULT_NEUTRAL_DELTA,
): ContributionTone {
  assertFinite(delta, "delta");
  assertFinite(neutralDelta, "neutralDelta");
  if (neutralDelta < 0) {
    throw new RangeError("neutralDelta must be greater than or equal to zero.");
  }
  if (delta < -neutralDelta) return "favorable";
  if (delta > neutralDelta) return "unfavorable";
  return "neutral";
}

export function contributionStyleForDelta(
  delta: number,
  neutralDelta = DEFAULT_NEUTRAL_DELTA,
): Readonly<ContributionToneStyle> {
  return CONTRIBUTION_TONE_STYLES[
    contributionToneForDelta(delta, neutralDelta)
  ];
}

/** Stable descending absolute-total ranking; original atom order breaks ties. */
export function rankAtomContributions(
  contributions: readonly Readonly<AtomContributionDelta>[],
  limit: number = TOP_CONTRIBUTION_COUNT,
): readonly Readonly<AtomContributionDelta>[] {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError("Contribution rank limit must be a non-negative integer.");
  }
  return Object.freeze(
    [...contributions]
      .sort(
        (left, right) =>
          right.absoluteTotalDelta - left.absoluteTotalDelta ||
          left.atomIndex - right.atomIndex,
      )
      .slice(0, limit),
  );
}

export function createContributionLens(
  baseline: ScopedAutoGridScore,
  current: ScopedAutoGridScore,
  options: ContributionLensOptions = {},
): Readonly<ContributionLensResult> {
  validateScore(baseline, "baseline");
  validateScore(current, "current");
  if (baseline.systemId !== current.systemId) {
    throw new RangeError(
      `Contribution lens cannot compare systems ${baseline.systemId} and ${current.systemId}.`,
    );
  }
  if (baseline.score.atomScores.length !== current.score.atomScores.length) {
    throw new RangeError("Contribution lens atom counts do not match.");
  }

  const neutralDelta = options.neutralDelta ?? DEFAULT_NEUTRAL_DELTA;
  contributionToneForDelta(0, neutralDelta);

  const contributions = baseline.score.atomScores.map((baselineAtom, atomIndex) => {
    const currentAtom = current.score.atomScores[atomIndex];
    if (baselineAtom.atomId !== currentAtom.atomId) {
      throw new RangeError(
        `Contribution lens atom order mismatch at ${atomIndex}: ` +
          `${baselineAtom.atomId} versus ${currentAtom.atomId}.`,
      );
    }
    if (baselineAtom.mapType !== currentAtom.mapType) {
      throw new RangeError(
        `Contribution lens map type mismatch for atom ${baselineAtom.atomId}: ` +
          `${baselineAtom.mapType} versus ${currentAtom.mapType}.`,
      );
    }

    const baselineState = termsForAtom(baselineAtom);
    const currentState = termsForAtom(currentAtom);
    const delta = Object.freeze({
      affinity: currentState.affinity - baselineState.affinity,
      electrostatics:
        currentState.electrostatics - baselineState.electrostatics,
      desolvation: currentState.desolvation - baselineState.desolvation,
      total: currentState.total - baselineState.total,
    });
    assertApproximatelyEqual(
      delta.affinity + delta.electrostatics + delta.desolvation,
      delta.total,
      1,
      `atom ${baselineAtom.atomId} delta total`,
    );
    const tone = contributionToneForDelta(delta.total, neutralDelta);
    return Object.freeze({
      atomIndex,
      atomId: baselineAtom.atomId,
      mapType: baselineAtom.mapType,
      baseline: baselineState,
      current: currentState,
      delta,
      absoluteTotalDelta: Math.abs(delta.total),
      tone,
      style: CONTRIBUTION_TONE_STYLES[tone],
    }) satisfies Readonly<AtomContributionDelta>;
  });

  const termDelta = Object.freeze({
    affinity:
      current.score.terms.affinity - baseline.score.terms.affinity,
    electrostatics:
      current.score.terms.electrostatics -
      baseline.score.terms.electrostatics,
    desolvation:
      current.score.terms.desolvation - baseline.score.terms.desolvation,
  });
  const totalDelta = current.score.total - baseline.score.total;
  assertApproximatelyEqual(
    termDelta.affinity + termDelta.electrostatics + termDelta.desolvation,
    totalDelta,
    contributions.length,
    "aggregate delta total",
  );

  const atomSumDelta = Object.freeze({
    affinity: compensatedSum(
      contributions.map((contribution) => contribution.delta.affinity),
    ),
    electrostatics: compensatedSum(
      contributions.map((contribution) => contribution.delta.electrostatics),
    ),
    desolvation: compensatedSum(
      contributions.map((contribution) => contribution.delta.desolvation),
    ),
    total: compensatedSum(
      contributions.map((contribution) => contribution.delta.total),
    ),
  });
  const residual = Object.freeze({
    affinity: atomSumDelta.affinity - termDelta.affinity,
    electrostatics: atomSumDelta.electrostatics - termDelta.electrostatics,
    desolvation: atomSumDelta.desolvation - termDelta.desolvation,
    total: atomSumDelta.total - totalDelta,
  });
  const tolerance = toleranceFor(
    contributions.length,
    atomSumDelta.affinity,
    atomSumDelta.electrostatics,
    atomSumDelta.desolvation,
    atomSumDelta.total,
    termDelta.affinity,
    termDelta.electrostatics,
    termDelta.desolvation,
    totalDelta,
  );
  for (const [term, value] of Object.entries(residual)) {
    if (Math.abs(value) > tolerance) {
      throw new RangeError(
        `Contribution ${term} sum invariant failed: residual ${value}, ` +
          `tolerance ${tolerance}.`,
      );
    }
  }

  const tone = contributionToneForDelta(totalDelta, neutralDelta);
  return Object.freeze({
    model: CONTRIBUTION_LENS_MODEL,
    scope: CONTRIBUTION_LENS_SCOPE,
    systemId: baseline.systemId,
    baselinePoseLabel: baseline.poseLabel,
    currentPoseLabel: current.poseLabel,
    direction: "current-minus-baseline",
    atomCount: contributions.length,
    termDelta,
    totalDelta,
    tone,
    style: CONTRIBUTION_TONE_STYLES[tone],
    contributions: Object.freeze(contributions),
    topContributors: rankAtomContributions(
      contributions,
      TOP_CONTRIBUTION_COUNT,
    ),
    conservation: Object.freeze({
      tolerance,
      atomSumDelta,
      residual,
      invariantMet: true,
    }),
  });
}
