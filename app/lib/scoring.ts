/**
 * SNAP's deterministic, rigid-body interaction score.
 *
 * This module is intentionally described as "AD4-inspired", not AutoDock4 and
 * not a binding-affinity predictor.  It preserves the four interpretable AD4
 * interaction families and the published/default AD4 coefficients, but it
 * directly evaluates receptor/ligand atom pairs in the browser and introduces
 * explicit soft-core distances and per-pair clamps so an interactive drag can
 * never explode to Infinity.
 *
 * Primary references:
 * - Huey R et al. A semiempirical free energy force field with charge-based
 *   desolvation. J Comput Chem. 2007;28:1145-1152.
 *   https://doi.org/10.1002/jcc.20634
 * - Morris GM et al. AutoDock4 and AutoDockTools4. J Comput Chem.
 *   2009;30:2785-2791. https://doi.org/10.1002/jcc.21256
 * - Scripps' default AD4.1_bound.dat parameters:
 *   https://autodock.scripps.edu/wp-content/uploads/sites/31/2019/03/AD4.1_bound.dat
 * - AutoDock-GPU's current AD4 implementation (coefficients, pair mixing,
 *   Mehler-Solmajer dielectric, sigma=3.6 A desolvation Gaussian):
 *   https://github.com/ccsb-scripps/AutoDock-GPU
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Quaternion component order matches Three.js: x, y, z, w. */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type AutoDockAtomType =
  | "H"
  | "HD"
  | "HS"
  | "C"
  | "A"
  | "N"
  | "NA"
  | "NS"
  | "OA"
  | "OS"
  | "F"
  | "Mg"
  | "MG"
  | "P"
  | "SA"
  | "S"
  | "Cl"
  | "CL"
  | "Ca"
  | "CA"
  | "Mn"
  | "MN"
  | "Fe"
  | "FE"
  | "Zn"
  | "ZN"
  | "Br"
  | "BR"
  | "I"
  | (string & {});

/**
 * Atom parameters have the same meanings as AD4.1_bound.dat.
 * rii is the sum of van der Waals radii for two like atoms, in Angstrom.
 */
export interface AtomForceFieldParameters {
  rii: number;
  epsilon: number;
  volume: number;
  solvationParameter: number;
  hydrogenBondRadius: number;
  hydrogenBondEpsilon: number;
}

export interface MolecularAtom {
  id: string;
  name?: string;
  residueName?: string;
  residueNumber?: number;
  chain?: string;
  position: Vec3;
  element: string;
  autodockType: AutoDockAtomType;
  /** Prepared partial charge in units of elementary charge (normally Gasteiger). */
  partialCharge: number;
  donor: boolean;
  acceptor: boolean;
  /** Unit-ish vector pointing from donor toward its hydrogen/ideal acceptor. */
  donorDirection?: Vec3;
  /** Unit-ish vector pointing from acceptor toward its ideal incoming donor. */
  acceptorDirection?: Vec3;
  /** Optional explicit override for non-standard or carefully prepared atom types. */
  forceField?: Partial<AtomForceFieldParameters>;
}

export interface LigandPose {
  translation: Vec3;
  rotation: Quaternion;
  /** Rotation center in the ligand's original coordinate frame. Defaults to 0,0,0. */
  pivot?: Vec3;
}

export interface ScoringWeights {
  vanDerWaals: number;
  hydrogenBond: number;
  electrostatics: number;
  desolvation: number;
}

export interface ScoringOptions {
  weights: ScoringWeights;
  vanDerWaalsCutoff: number;
  electrostaticsCutoff: number;
  desolvationCutoff: number;
  /** Added in quadrature to distance for the bounded van der Waals term. */
  softCoreDistance: number;
  minimumElectrostaticDistance: number;
  maxVanDerWaalsRepulsion: number;
  maxVanDerWaalsAttraction: number;
  maxElectrostaticMagnitude: number;
  maxDesolvationMagnitude: number;
  maxHydrogenBondRepulsion: number;
  maxHydrogenBondAttraction: number;
  hydrogenBondMaximumOffset: number;
  hydrogenBondMinimumAlignment: number;
  hydrogenBondIdealAlignment: number;
  desolvationSigma: number;
  chargeAbsoluteSolvationParameter: number;
  clashDistanceScale: number;
  contactDistance: number;
  maxReportedInteractions: number;
}

export type ScoringOverrides = Partial<Omit<ScoringOptions, "weights">> & {
  weights?: Partial<ScoringWeights>;
};

export interface ScoreTerms {
  vanDerWaals: number;
  hydrogenBond: number;
  electrostatics: number;
  desolvation: number;
}

export interface PairInteraction {
  receptorAtomId: string;
  ligandAtomId: string;
  distance: number;
}

export interface HydrogenBondInteraction extends PairInteraction {
  donorAtomId: string;
  acceptorAtomId: string;
  donorAlignment: number | null;
  acceptorAlignment: number | null;
  geometryFactor: number;
  energy: number;
}

export interface StericClash extends PairInteraction {
  overlap: number;
  severity: number;
}

export interface ContactInteraction extends PairInteraction {
  kind: "polar" | "hydrophobic" | "other";
}

export interface ScoreBreakdown {
  readonly model: typeof SCORING_MODEL_NAME;
  /** Weighted, bounded AD4-inspired terms. More negative is more favorable. */
  terms: ScoreTerms;
  /** Same pair functions before the four published AD4 regression weights. */
  rawTerms: ScoreTerms;
  total: number;
  clashes: {
    count: number;
    severity: number;
    pairs: StericClash[];
  };
  hydrogenBonds: HydrogenBondInteraction[];
  contacts: ContactInteraction[];
  evaluatedPairs: number;
}

export interface PosePanelEntry {
  id: string;
  pose: LigandPose;
}

export interface ScoredPosePanelEntry extends PosePanelEntry {
  score: ScoreBreakdown;
}

export interface GridDimensions {
  x: number;
  y: number;
  z: number;
}

export interface ParsedAutoGridMap {
  mapType: string;
  spacing: number;
  /** Grid-point counts. AutoGrid's NELEMENTS intervals become +1 point per axis. */
  dimensions: GridDimensions;
  center: Vec3;
  origin: Vec3;
  /** AutoGrid file order is x-fastest, then y, then z. */
  values: Float32Array;
}

export interface AutoGridMapSet {
  spacing: number;
  dimensions: GridDimensions;
  center: Vec3;
  origin: Vec3;
  affinityMaps: Readonly<Record<string, Float32Array>>;
  electrostaticsMap: Float32Array;
  desolvationMap: Float32Array;
}

export interface AutoGridScoringOptions {
  /** Finite browser penalty per ligand atom outside the prepared grid. */
  outsideGridPenalty: number;
  /** Fail closed by default when a prepared ligand type has no affinity map. */
  missingAffinityMap: "error" | "zero";
}

export interface AutoGridAtomScore {
  atomId: string;
  mapType: string;
  position: Vec3;
  affinity: number;
  electrostatics: number;
  desolvation: number;
  total: number;
  outsideGrid: boolean;
}

export interface AutoGridScoreBreakdown {
  readonly model: typeof AUTOGRID_MODEL_NAME;
  /** Already weighted by AutoGrid/AD4; do not apply AUTODOCK_COEFFICIENTS again. */
  terms: {
    affinity: number;
    electrostatics: number;
    desolvation: number;
    outsideGridPenalty: number;
  };
  total: number;
  outsideGridAtoms: number;
  atomScores: AutoGridAtomScore[];
}

export const SCORING_MODEL_NAME = "SNAP AD4-inspired rigid pair score v1" as const;
export const AUTOGRID_MODEL_NAME = "AutoGrid4 trilinear pose score" as const;

/**
 * Bound-model regression weights from AD4.1_bound.dat / Huey et al. Table 3.
 * The torsional coefficient (0.2983) is intentionally absent: a rigid-body
 * pose has no modeled change in ligand torsional entropy.
 */
export const AUTODOCK_COEFFICIENTS: Readonly<ScoringWeights> = Object.freeze({
  vanDerWaals: 0.1662,
  hydrogenBond: 0.1209,
  electrostatics: 0.1406,
  desolvation: 0.1322,
});

/** Coulomb conversion used by AutoDock-GPU: kcal A / (mol e^2). */
const COULOMB_KCAL_ANGSTROM = 332.06363;

/**
 * AD4.1_bound.dat's original charge-dependent atomic solvation parameter.
 * AutoDock-GPU identifies 0.01097 as the original AutoDock QASP value.
 */
const AUTODOCK_QASP = 0.01097;

const ZERO: Readonly<Vec3> = Object.freeze({ x: 0, y: 0, z: 0 });

export const IDENTITY_POSE: Readonly<LigandPose> = Object.freeze({
  translation: ZERO,
  rotation: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
  pivot: ZERO,
});

/**
 * The first 27 common entries from Scripps' AD4.1_bound.dat.  Entries are data,
 * not tuned to SNAP. Unknown types fall back by element and should be treated
 * as an explicit scientific limitation in public claims.
 */
export const AUTODOCK_ATOM_PARAMETERS: Readonly<
  Record<string, Readonly<AtomForceFieldParameters>>
> = Object.freeze({
  H: atomParameters(2.0, 0.02, 0, 0.00051, 0, 0),
  HD: atomParameters(2.0, 0.02, 0, 0.00051, 0, 1),
  HS: atomParameters(2.0, 0.02, 0, 0.00051, 0, 1),
  C: atomParameters(4.0, 0.15, 33.5103, -0.00143, 0, 0),
  A: atomParameters(4.0, 0.15, 33.5103, -0.00052, 0, 0),
  N: atomParameters(3.5, 0.16, 22.4493, -0.00162, 0, 0),
  NA: atomParameters(3.5, 0.16, 22.4493, -0.00162, 1.9, 5),
  NS: atomParameters(3.5, 0.16, 22.4493, -0.00162, 1.9, 5),
  OA: atomParameters(3.2, 0.2, 17.1573, -0.00251, 1.9, 5),
  OS: atomParameters(3.2, 0.2, 17.1573, -0.00251, 1.9, 5),
  F: atomParameters(3.09, 0.08, 15.448, -0.0011, 0, 0),
  Mg: atomParameters(1.3, 0.875, 1.56, -0.0011, 0, 0),
  MG: atomParameters(1.3, 0.875, 1.56, -0.0011, 0, 0),
  P: atomParameters(4.2, 0.2, 38.7924, -0.0011, 0, 0),
  SA: atomParameters(4.0, 0.2, 33.5103, -0.00214, 2.5, 1),
  S: atomParameters(4.0, 0.2, 33.5103, -0.00214, 0, 0),
  Cl: atomParameters(4.09, 0.276, 35.8235, -0.0011, 0, 0),
  CL: atomParameters(4.09, 0.276, 35.8235, -0.0011, 0, 0),
  Ca: atomParameters(1.98, 0.55, 2.77, -0.0011, 0, 0),
  CA: atomParameters(1.98, 0.55, 2.77, -0.0011, 0, 0),
  Mn: atomParameters(1.3, 0.875, 2.14, -0.0011, 0, 0),
  MN: atomParameters(1.3, 0.875, 2.14, -0.0011, 0, 0),
  Fe: atomParameters(1.3, 0.01, 1.84, -0.0011, 0, 0),
  FE: atomParameters(1.3, 0.01, 1.84, -0.0011, 0, 0),
  Zn: atomParameters(1.48, 0.55, 1.7, -0.0011, 0, 0),
  ZN: atomParameters(1.48, 0.55, 1.7, -0.0011, 0, 0),
  Br: atomParameters(4.33, 0.389, 42.5661, -0.0011, 0, 0),
  BR: atomParameters(4.33, 0.389, 42.5661, -0.0011, 0, 0),
  I: atomParameters(4.72, 0.55, 55.0585, -0.0011, 0, 0),
});

export const DEFAULT_SCORING_OPTIONS: Readonly<ScoringOptions> = Object.freeze({
  weights: AUTODOCK_COEFFICIENTS,
  vanDerWaalsCutoff: 8,
  electrostaticsCutoff: 20.48,
  desolvationCutoff: 20.48,
  softCoreDistance: 0.45,
  minimumElectrostaticDistance: 0.75,
  maxVanDerWaalsRepulsion: 8,
  maxVanDerWaalsAttraction: 2,
  maxElectrostaticMagnitude: 6,
  maxDesolvationMagnitude: 2,
  maxHydrogenBondRepulsion: 4,
  maxHydrogenBondAttraction: 2,
  hydrogenBondMaximumOffset: 0.9,
  hydrogenBondMinimumAlignment: 0.5,
  hydrogenBondIdealAlignment: 0.94,
  desolvationSigma: 3.6,
  chargeAbsoluteSolvationParameter: AUTODOCK_QASP,
  clashDistanceScale: 0.72,
  contactDistance: 4.2,
  maxReportedInteractions: 32,
});

export const DEFAULT_AUTOGRID_SCORING_OPTIONS: Readonly<AutoGridScoringOptions> =
  Object.freeze({
    outsideGridPenalty: 1000,
    missingAffinityMap: "error",
  });

export const SCIENTIFIC_LIMITATIONS = Object.freeze([
  "Rigid receptor and rigid ligand; no conformational search or minimization.",
  "Prepared atom types, protonation states, and partial charges are accepted as input, not inferred.",
  "Pairwise implicit-solvent score only; no explicit water, ions, polarization, or receptor entropy.",
  "Soft-core distances and per-pair clamps deviate from AutoDock4 to keep interactive dragging finite.",
  "Heavy-atom donor/acceptor geometry is a SNAP extension; exact AD4 normally scores explicit donor hydrogens.",
  "Element fallbacks for unknown AutoDock types are illustrative and are not calibrated force-field parameters.",
  "The total is an interaction score, not a validated binding affinity or docking result.",
]);

function atomParameters(
  rii: number,
  epsilon: number,
  volume: number,
  solvationParameter: number,
  hydrogenBondRadius: number,
  hydrogenBondEpsilon: number,
): Readonly<AtomForceFieldParameters> {
  return Object.freeze({
    rii,
    epsilon,
    volume,
    solvationParameter,
    hydrogenBondRadius,
    hydrogenBondEpsilon,
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function magnitudeSquared(vector: Vec3): number {
  return vector.x * vector.x + vector.y * vector.y + vector.z * vector.z;
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite; received ${String(value)}`);
  }
}

function assertFiniteVector(vector: Vec3, label: string): void {
  assertFiniteNumber(vector.x, `${label}.x`);
  assertFiniteNumber(vector.y, `${label}.y`);
  assertFiniteNumber(vector.z, `${label}.z`);
}

function normalizedVector(vector: Vec3): Vec3 | null {
  const squared = magnitudeSquared(vector);
  if (squared <= Number.EPSILON) return null;
  const reciprocal = 1 / Math.sqrt(squared);
  return {
    x: vector.x * reciprocal,
    y: vector.y * reciprocal,
    z: vector.z * reciprocal,
  };
}

function dot(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function normalizeQuaternion(quaternion: Quaternion): Quaternion {
  assertFiniteNumber(quaternion.x, "quaternion.x");
  assertFiniteNumber(quaternion.y, "quaternion.y");
  assertFiniteNumber(quaternion.z, "quaternion.z");
  assertFiniteNumber(quaternion.w, "quaternion.w");

  const norm = Math.sqrt(
    quaternion.x * quaternion.x +
      quaternion.y * quaternion.y +
      quaternion.z * quaternion.z +
      quaternion.w * quaternion.w,
  );

  if (norm <= Number.EPSILON) return { x: 0, y: 0, z: 0, w: 1 };
  return {
    x: quaternion.x / norm,
    y: quaternion.y / norm,
    z: quaternion.z / norm,
    w: quaternion.w / norm,
  };
}

export function quaternionFromAxisAngle(axis: Vec3, angleRadians: number): Quaternion {
  assertFiniteVector(axis, "axis");
  assertFiniteNumber(angleRadians, "angleRadians");
  const normalizedAxis = normalizedVector(axis);
  if (!normalizedAxis) return { x: 0, y: 0, z: 0, w: 1 };
  const halfAngle = angleRadians / 2;
  const sine = Math.sin(halfAngle);
  return normalizeQuaternion({
    x: normalizedAxis.x * sine,
    y: normalizedAxis.y * sine,
    z: normalizedAxis.z * sine,
    w: Math.cos(halfAngle),
  });
}

/** Composition order: the returned quaternion applies right, then left. */
export function multiplyQuaternions(left: Quaternion, right: Quaternion): Quaternion {
  const a = normalizeQuaternion(left);
  const b = normalizeQuaternion(right);
  return normalizeQuaternion({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
}

function rotateVector(vector: Vec3, quaternion: Quaternion): Vec3 {
  const q = normalizeQuaternion(quaternion);
  // Quaternion-vector rotation expanded to avoid allocating q * v * q^-1.
  const tx = 2 * (q.y * vector.z - q.z * vector.y);
  const ty = 2 * (q.z * vector.x - q.x * vector.z);
  const tz = 2 * (q.x * vector.y - q.y * vector.x);
  return {
    x: vector.x + q.w * tx + (q.y * tz - q.z * ty),
    y: vector.y + q.w * ty + (q.z * tx - q.x * tz),
    z: vector.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

export function transformPoint(point: Vec3, pose: LigandPose = IDENTITY_POSE): Vec3 {
  assertFiniteVector(point, "point");
  assertFiniteVector(pose.translation, "pose.translation");
  const pivot = pose.pivot ?? ZERO;
  assertFiniteVector(pivot, "pose.pivot");
  const local = subtract(point, pivot);
  const rotated = rotateVector(local, pose.rotation);
  return {
    x: rotated.x + pivot.x + pose.translation.x,
    y: rotated.y + pivot.y + pose.translation.y,
    z: rotated.z + pivot.z + pose.translation.z,
  };
}

export function transformDirection(direction: Vec3, pose: LigandPose = IDENTITY_POSE): Vec3 {
  assertFiniteVector(direction, "direction");
  return rotateVector(direction, pose.rotation);
}

export function transformLigandAtoms(
  atoms: readonly MolecularAtom[],
  pose: LigandPose = IDENTITY_POSE,
): MolecularAtom[] {
  return atoms.map((atom) => ({
    ...atom,
    position: transformPoint(atom.position, pose),
    donorDirection: atom.donorDirection
      ? transformDirection(atom.donorDirection, pose)
      : undefined,
    acceptorDirection: atom.acceptorDirection
      ? transformDirection(atom.acceptorDirection, pose)
      : undefined,
  }));
}

function fallbackTypeForAtom(atom: MolecularAtom): string {
  const element = atom.element.trim().toUpperCase();
  if (element === "H") return atom.donor ? "HD" : "H";
  if (element === "C") return "C";
  if (element === "N") return atom.acceptor ? "NA" : "N";
  if (element === "O") return "OA";
  if (element === "S") return atom.acceptor ? "SA" : "S";
  if (element === "CL") return "CL";
  if (element === "BR") return "BR";
  if (element === "I") return "I";
  if (element === "F") return "F";
  if (element === "P") return "P";
  if (element === "MG") return "MG";
  if (element === "CA") return "CA";
  if (element === "MN") return "MN";
  if (element === "FE") return "FE";
  if (element === "ZN") return "ZN";
  return "C";
}

export function resolveAtomParameters(atom: MolecularAtom): AtomForceFieldParameters {
  const requested = String(atom.autodockType).trim();
  const exact = AUTODOCK_ATOM_PARAMETERS[requested];
  const upper = AUTODOCK_ATOM_PARAMETERS[requested.toUpperCase()];
  const fallback = AUTODOCK_ATOM_PARAMETERS[fallbackTypeForAtom(atom)];
  const base = exact ?? upper ?? fallback ?? AUTODOCK_ATOM_PARAMETERS.C;
  const resolved = { ...base, ...atom.forceField };

  for (const [key, value] of Object.entries(resolved)) {
    assertFiniteNumber(value, `atom ${atom.id} forceField.${key}`);
  }
  return resolved;
}

/**
 * Mehler-Solmajer distance-dependent dielectric used by AD4.
 * Constants are reproduced from AutoDock-GPU's calc_ddd_Mehler_Solmajer:
 * A=-8.5525, epsilonWater=78.4, k=7.7839, lambda=0.003627.
 */
export function distanceDependentDielectric(distanceAngstrom: number): number {
  assertFiniteNumber(distanceAngstrom, "distanceAngstrom");
  const distance = Math.max(0, distanceAngstrom);
  const a = -8.5525;
  const epsilonWater = 78.4;
  const b = epsilonWater - a;
  const k = 7.7839;
  const lambda = 0.003627;
  return a + b / (1 + k * Math.exp(-lambda * b * distance));
}

function parseAutoGridHeaderVector(
  lines: readonly string[],
  keyword: string,
  expectedValues: number,
): number[] {
  const line = lines.find((candidate) => candidate.trim().startsWith(keyword));
  if (!line) throw new TypeError(`AutoGrid map is missing ${keyword}`);
  const values = line
    .trim()
    .slice(keyword.length)
    .trim()
    .split(/\s+/)
    .map(Number);
  if (values.length !== expectedValues || values.some((value) => !Number.isFinite(value))) {
    throw new TypeError(`AutoGrid ${keyword} must contain ${expectedValues} finite value(s)`);
  }
  return values;
}

/**
 * Parse one standard ASCII AutoGrid4 `.map` file.
 *
 * AutoGrid writes six preamble lines followed by one scalar per line, but this
 * parser keys off SPACING/NELEMENTS/CENTER rather than assuming a fixed line
 * count. NELEMENTS denotes intervals; stored grid points are each value + 1.
 */
export function parseAutoGridMap(mapType: string, text: string): ParsedAutoGridMap {
  const normalizedType = mapType.trim();
  if (!normalizedType) throw new TypeError("AutoGrid mapType must be non-empty");
  const lines = text.split(/\r?\n/);
  const [spacing] = parseAutoGridHeaderVector(lines, "SPACING", 1);
  const elements = parseAutoGridHeaderVector(lines, "NELEMENTS", 3);
  const centerValues = parseAutoGridHeaderVector(lines, "CENTER", 3);

  if (spacing <= 0) throw new RangeError("AutoGrid SPACING must be positive");
  if (elements.some((value) => !Number.isInteger(value) || value < 1)) {
    throw new RangeError("AutoGrid NELEMENTS values must be positive integers");
  }

  const dimensions: GridDimensions = {
    x: elements[0] + 1,
    y: elements[1] + 1,
    z: elements[2] + 1,
  };
  const center: Vec3 = { x: centerValues[0], y: centerValues[1], z: centerValues[2] };
  const origin: Vec3 = {
    x: center.x - (elements[0] * spacing) / 2,
    y: center.y - (elements[1] * spacing) / 2,
    z: center.z - (elements[2] * spacing) / 2,
  };

  const centerLineIndex = lines.findIndex((candidate) => candidate.trim().startsWith("CENTER"));
  const values: number[] = [];
  for (let index = centerLineIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    // Standard maps contain one scalar per line. Accept whitespace-separated
    // scalars as a harmless convenience for generated test/packed assets.
    for (const token of trimmed.split(/\s+/)) {
      const value = Number(token);
      if (!Number.isFinite(value)) {
        throw new TypeError(`AutoGrid ${normalizedType} contains non-numeric data: ${token}`);
      }
      values.push(value);
    }
  }

  const expectedValues = dimensions.x * dimensions.y * dimensions.z;
  if (values.length !== expectedValues) {
    throw new RangeError(
      `AutoGrid ${normalizedType} expected ${expectedValues} values; received ${values.length}`,
    );
  }

  return {
    mapType: normalizedType,
    spacing,
    dimensions,
    center,
    origin,
    values: Float32Array.from(values),
  };
}

function nearlyEqual(left: number, right: number, tolerance = 1e-6): boolean {
  return Math.abs(left - right) <= tolerance;
}

function sameGridGeometry(left: ParsedAutoGridMap, right: ParsedAutoGridMap): boolean {
  return (
    nearlyEqual(left.spacing, right.spacing) &&
    left.dimensions.x === right.dimensions.x &&
    left.dimensions.y === right.dimensions.y &&
    left.dimensions.z === right.dimensions.z &&
    nearlyEqual(left.center.x, right.center.x) &&
    nearlyEqual(left.center.y, right.center.y) &&
    nearlyEqual(left.center.z, right.center.z)
  );
}

/** Assemble type-affinity, electrostatic (`e`), and desolvation (`d`) maps. */
export function createAutoGridMapSet(maps: readonly ParsedAutoGridMap[]): AutoGridMapSet {
  if (maps.length < 3) {
    throw new RangeError("AutoGrid map set requires affinity, electrostatics, and desolvation maps");
  }
  const reference = maps[0];
  const seen = new Set<string>();
  const affinityMaps: Record<string, Float32Array> = {};
  let electrostaticsMap: Float32Array | undefined;
  let desolvationMap: Float32Array | undefined;

  for (const map of maps) {
    if (!sameGridGeometry(reference, map)) {
      throw new RangeError(`AutoGrid ${map.mapType} geometry does not match ${reference.mapType}`);
    }
    const canonical = map.mapType.toLowerCase();
    if (seen.has(canonical)) throw new RangeError(`Duplicate AutoGrid map type: ${map.mapType}`);
    seen.add(canonical);
    if (canonical === "e" || canonical === "electrostatics") {
      electrostaticsMap = map.values;
    } else if (canonical === "d" || canonical === "desolvation") {
      desolvationMap = map.values;
    } else {
      affinityMaps[map.mapType] = map.values;
      affinityMaps[map.mapType.toUpperCase()] = map.values;
    }
  }

  if (!electrostaticsMap) throw new RangeError("AutoGrid map set is missing electrostatics map e");
  if (!desolvationMap) throw new RangeError("AutoGrid map set is missing desolvation map d");
  if (Object.keys(affinityMaps).length === 0) {
    throw new RangeError("AutoGrid map set has no atom-type affinity maps");
  }

  return {
    spacing: reference.spacing,
    dimensions: { ...reference.dimensions },
    center: { ...reference.center },
    origin: { ...reference.origin },
    affinityMaps: Object.freeze(affinityMaps),
    electrostaticsMap,
    desolvationMap,
  };
}

interface GridCoordinate {
  x: number;
  y: number;
  z: number;
}

function toGridCoordinate(grid: AutoGridMapSet, position: Vec3): GridCoordinate | null {
  const coordinate = {
    x: (position.x - grid.origin.x) / grid.spacing,
    y: (position.y - grid.origin.y) / grid.spacing,
    z: (position.z - grid.origin.z) / grid.spacing,
  };
  const maxX = grid.dimensions.x - 1;
  const maxY = grid.dimensions.y - 1;
  const maxZ = grid.dimensions.z - 1;
  if (
    coordinate.x < 0 ||
    coordinate.y < 0 ||
    coordinate.z < 0 ||
    coordinate.x >= maxX ||
    coordinate.y >= maxY ||
    coordinate.z >= maxZ
  ) {
    return null;
  }
  return coordinate;
}

function gridIndex(dimensions: GridDimensions, x: number, y: number, z: number): number {
  // Matches AutoGrid/AutoDock-GPU: z outer loop, y middle, x inner.
  return x + dimensions.x * (y + dimensions.y * z);
}

function trilinearSample(
  values: Float32Array,
  dimensions: GridDimensions,
  coordinate: GridCoordinate,
): number {
  const x0 = Math.floor(coordinate.x);
  const y0 = Math.floor(coordinate.y);
  const z0 = Math.floor(coordinate.z);
  const x1 = Math.min(x0 + 1, dimensions.x - 1);
  const y1 = Math.min(y0 + 1, dimensions.y - 1);
  const z1 = Math.min(z0 + 1, dimensions.z - 1);
  const tx = coordinate.x - x0;
  const ty = coordinate.y - y0;
  const tz = coordinate.z - z0;
  const sample = (x: number, y: number, z: number) => values[gridIndex(dimensions, x, y, z)];
  const c000 = sample(x0, y0, z0);
  const c100 = sample(x1, y0, z0);
  const c010 = sample(x0, y1, z0);
  const c110 = sample(x1, y1, z0);
  const c001 = sample(x0, y0, z1);
  const c101 = sample(x1, y0, z1);
  const c011 = sample(x0, y1, z1);
  const c111 = sample(x1, y1, z1);
  const c00 = c000 * (1 - tx) + c100 * tx;
  const c10 = c010 * (1 - tx) + c110 * tx;
  const c01 = c001 * (1 - tx) + c101 * tx;
  const c11 = c011 * (1 - tx) + c111 * tx;
  const c0 = c00 * (1 - ty) + c10 * ty;
  const c1 = c01 * (1 - ty) + c11 * ty;
  return c0 * (1 - tz) + c1 * tz;
}

function affinityMapForAtom(
  grid: AutoGridMapSet,
  atom: MolecularAtom,
): { mapType: string; values: Float32Array } | null {
  const requested = String(atom.autodockType).trim();
  const candidates = [requested, requested.toUpperCase(), fallbackTypeForAtom(atom)];
  for (const candidate of candidates) {
    const values = grid.affinityMaps[candidate];
    if (values) return { mapType: candidate, values };
  }
  return null;
}

/**
 * Evaluate the same map expression used by AutoDock4 for a rigid pose:
 *
 *   sum_i affinity[type_i](r_i) + q_i * electrostatics(r_i)
 *         + |q_i| * desolvation(r_i)
 *
 * All three maps are already weighted by AutoGrid, so AD4 regression weights
 * MUST NOT be applied again. This is the primary gauge score when official
 * maps are available; `scorePose` remains an explanatory pair decomposition.
 */
export function scorePoseWithAutoGrid(
  grid: AutoGridMapSet,
  ligand: readonly MolecularAtom[],
  pose: LigandPose = IDENTITY_POSE,
  overrides?: Partial<AutoGridScoringOptions>,
): AutoGridScoreBreakdown {
  const options: AutoGridScoringOptions = {
    ...DEFAULT_AUTOGRID_SCORING_OPTIONS,
    ...overrides,
  };
  assertFiniteNumber(options.outsideGridPenalty, "outsideGridPenalty");
  ligand.forEach((atom) => validateAtom(atom, "ligand"));
  const transformedLigand = transformLigandAtoms(ligand, pose);
  const atomScores: AutoGridAtomScore[] = [];
  let affinity = 0;
  let electrostatics = 0;
  let desolvation = 0;
  let outsideGridPenalty = 0;
  let outsideGridAtoms = 0;

  for (const atom of transformedLigand) {
    const position = atom.position;
    const coordinate = toGridCoordinate(grid, position);
    const affinityMap = affinityMapForAtom(grid, atom);
    if (!affinityMap && options.missingAffinityMap === "error") {
      throw new RangeError(
        `AutoGrid has no affinity map for atom ${atom.id} type ${String(atom.autodockType)}`,
      );
    }

    if (!coordinate) {
      outsideGridAtoms += 1;
      outsideGridPenalty += options.outsideGridPenalty;
      atomScores.push({
        atomId: atom.id,
        mapType: affinityMap?.mapType ?? String(atom.autodockType),
        position: { ...position },
        affinity: 0,
        electrostatics: 0,
        desolvation: 0,
        total: rounded(options.outsideGridPenalty),
        outsideGrid: true,
      });
      continue;
    }

    const atomAffinity = affinityMap
      ? trilinearSample(affinityMap.values, grid.dimensions, coordinate)
      : 0;
    const atomElectrostatics =
      atom.partialCharge * trilinearSample(grid.electrostaticsMap, grid.dimensions, coordinate);
    const atomDesolvation =
      Math.abs(atom.partialCharge) *
      trilinearSample(grid.desolvationMap, grid.dimensions, coordinate);
    const atomTotal = atomAffinity + atomElectrostatics + atomDesolvation;
    affinity += atomAffinity;
    electrostatics += atomElectrostatics;
    desolvation += atomDesolvation;
    atomScores.push({
      atomId: atom.id,
      mapType: affinityMap?.mapType ?? String(atom.autodockType),
      position: { ...position },
      affinity: rounded(atomAffinity),
      electrostatics: rounded(atomElectrostatics),
      desolvation: rounded(atomDesolvation),
      total: rounded(atomTotal),
      outsideGrid: false,
    });
  }

  const terms = {
    affinity: rounded(affinity),
    electrostatics: rounded(electrostatics),
    desolvation: rounded(desolvation),
    outsideGridPenalty: rounded(outsideGridPenalty),
  };
  return {
    model: AUTOGRID_MODEL_NAME,
    terms,
    total: rounded(
      terms.affinity + terms.electrostatics + terms.desolvation + terms.outsideGridPenalty,
    ),
    outsideGridAtoms,
    atomScores,
  };
}

function mergeOptions(overrides: ScoringOverrides | undefined): ScoringOptions {
  return {
    ...DEFAULT_SCORING_OPTIONS,
    ...overrides,
    weights: {
      ...DEFAULT_SCORING_OPTIONS.weights,
      ...overrides?.weights,
    },
  };
}

function validateAtom(atom: MolecularAtom, role: string): void {
  if (!atom.id) throw new TypeError(`${role} atom id must be non-empty`);
  assertFiniteVector(atom.position, `${role} atom ${atom.id}.position`);
  assertFiniteNumber(atom.partialCharge, `${role} atom ${atom.id}.partialCharge`);
  if (atom.donorDirection) {
    assertFiniteVector(atom.donorDirection, `${role} atom ${atom.id}.donorDirection`);
  }
  if (atom.acceptorDirection) {
    assertFiniteVector(atom.acceptorDirection, `${role} atom ${atom.id}.acceptorDirection`);
  }
}

function alignmentFactor(
  direction: Vec3 | undefined,
  targetDirection: Vec3,
  options: ScoringOptions,
): { alignment: number | null; factor: number } {
  if (!direction) return { alignment: null, factor: 1 };
  const normalizedDirection = normalizedVector(direction);
  if (!normalizedDirection) return { alignment: 0, factor: 0 };
  const alignment = clamp(dot(normalizedDirection, targetDirection), -1, 1);
  return {
    alignment,
    factor: smoothstep(
      options.hydrogenBondMinimumAlignment,
      options.hydrogenBondIdealAlignment,
      alignment,
    ),
  };
}

interface HydrogenBondCandidate {
  donor: MolecularAtom;
  acceptor: MolecularAtom;
  donorIsLigand: boolean;
}

function hydrogenBondCandidate(
  receptorAtom: MolecularAtom,
  ligandAtom: MolecularAtom,
): HydrogenBondCandidate | null {
  const candidates: HydrogenBondCandidate[] = [];
  if (ligandAtom.donor && receptorAtom.acceptor) {
    candidates.push({ donor: ligandAtom, acceptor: receptorAtom, donorIsLigand: true });
  }
  if (receptorAtom.donor && ligandAtom.acceptor) {
    candidates.push({ donor: receptorAtom, acceptor: ligandAtom, donorIsLigand: false });
  }
  return candidates[0] ?? null;
}

function isHydrogen(atom: MolecularAtom): boolean {
  const type = String(atom.autodockType).toUpperCase();
  return atom.element.trim().toUpperCase() === "H" || type === "HD" || type === "HS";
}

function hBondGeometry(
  candidate: HydrogenBondCandidate,
  options: ScoringOptions,
): {
  donorAlignment: number | null;
  acceptorAlignment: number | null;
  factor: number;
} {
  const donorToAcceptorVector = subtract(candidate.acceptor.position, candidate.donor.position);
  const donorToAcceptor = normalizedVector(donorToAcceptorVector);
  if (!donorToAcceptor) {
    return { donorAlignment: 0, acceptorAlignment: 0, factor: 0 };
  }
  const acceptorToDonor = {
    x: -donorToAcceptor.x,
    y: -donorToAcceptor.y,
    z: -donorToAcceptor.z,
  };
  const donor = alignmentFactor(candidate.donor.donorDirection, donorToAcceptor, options);
  const acceptor = alignmentFactor(
    candidate.acceptor.acceptorDirection,
    acceptorToDonor,
    options,
  );
  return {
    donorAlignment: donor.alignment,
    acceptorAlignment: acceptor.alignment,
    factor: donor.factor * acceptor.factor,
  };
}

function contactKind(receptor: MolecularAtom, ligand: MolecularAtom): ContactInteraction["kind"] {
  const receptorElement = receptor.element.trim().toUpperCase();
  const ligandElement = ligand.element.trim().toUpperCase();
  if (receptor.donor || receptor.acceptor || ligand.donor || ligand.acceptor) return "polar";
  if ((receptorElement === "C" || receptorElement === "S") &&
      (ligandElement === "C" || ligandElement === "S")) {
    return "hydrophobic";
  }
  return "other";
}

function rounded(value: number): number {
  // Suppress -0 and make repeated UI serialization stable without materially
  // changing the energy (12 significant digits is far below input uncertainty).
  if (Math.abs(value) < 1e-12) return 0;
  return Number(value.toPrecision(12));
}

/**
 * Score one rigid ligand pose against a rigid receptor.
 *
 * Deviations from exact AD4:
 * - direct pairs instead of AutoGrid interpolation;
 * - soft-core vdW distance and bounded per-pair contributions;
 * - optional heavy-atom directional H-bonds when explicit donor H atoms are
 *   unavailable; missing direction vectors reduce the gate to distance-only;
 * - no torsional entropy, intramolecular energy, search, or calibration claim.
 */
export function scorePose(
  receptor: readonly MolecularAtom[],
  ligand: readonly MolecularAtom[],
  pose: LigandPose = IDENTITY_POSE,
  overrides?: ScoringOverrides,
): ScoreBreakdown {
  const options = mergeOptions(overrides);
  receptor.forEach((atom) => validateAtom(atom, "receptor"));
  ligand.forEach((atom) => validateAtom(atom, "ligand"));
  const transformedLigand = transformLigandAtoms(ligand, pose);
  const receptorParameters = receptor.map(resolveAtomParameters);
  const ligandParameters = ligand.map(resolveAtomParameters);

  const rawTerms: ScoreTerms = {
    vanDerWaals: 0,
    hydrogenBond: 0,
    electrostatics: 0,
    desolvation: 0,
  };
  const terms: ScoreTerms = {
    vanDerWaals: 0,
    hydrogenBond: 0,
    electrostatics: 0,
    desolvation: 0,
  };
  const hydrogenBonds: HydrogenBondInteraction[] = [];
  const clashPairs: StericClash[] = [];
  const contacts: ContactInteraction[] = [];
  let clashCount = 0;
  let clashSeverity = 0;
  let evaluatedPairs = 0;

  for (let receptorIndex = 0; receptorIndex < receptor.length; receptorIndex += 1) {
    const receptorAtom = receptor[receptorIndex];
    const receptorParameter = receptorParameters[receptorIndex];

    for (let ligandIndex = 0; ligandIndex < transformedLigand.length; ligandIndex += 1) {
      const ligandAtom = transformedLigand[ligandIndex];
      const ligandParameter = ligandParameters[ligandIndex];
      evaluatedPairs += 1;

      const displacement = subtract(ligandAtom.position, receptorAtom.position);
      const distanceSquared = magnitudeSquared(displacement);
      const distance = Math.sqrt(distanceSquared);
      const equilibriumDistance = (receptorParameter.rii + ligandParameter.rii) / 2;
      const hBond = hydrogenBondCandidate(receptorAtom, ligandAtom);
      const explicitHydrogenBond = Boolean(hBond && isHydrogen(hBond.donor));

      if (distance < options.vanDerWaalsCutoff && !explicitHydrogenBond) {
        const softDistance = Math.sqrt(
          distanceSquared + options.softCoreDistance * options.softCoreDistance,
        );
        const ratio = equilibriumDistance / Math.max(softDistance, Number.EPSILON);
        const ratio6 = ratio ** 6;
        const mixedEpsilon = Math.sqrt(
          Math.max(0, receptorParameter.epsilon * ligandParameter.epsilon),
        );
        const rawVanDerWaals = mixedEpsilon * (ratio6 * ratio6 - 2 * ratio6);
        const weightedVanDerWaals = clamp(
          rawVanDerWaals * options.weights.vanDerWaals,
          -options.maxVanDerWaalsAttraction,
          options.maxVanDerWaalsRepulsion,
        );
        rawTerms.vanDerWaals += rawVanDerWaals;
        terms.vanDerWaals += weightedVanDerWaals;
      }

      if (hBond) {
        const donorParameter = hBond.donorIsLigand ? ligandParameter : receptorParameter;
        const acceptorParameter = hBond.donorIsLigand ? receptorParameter : ligandParameter;
        const donorIsHydrogen = isHydrogen(hBond.donor);
        // Exact AD4 scores explicit HD/HS...acceptor around the acceptor's
        // Rij_hb (~1.9 A for N/O). For a heavy donor proxy, SNAP adds 1.0 A,
        // approximately the donor-H bond length. That +1.0 A is a deliberate
        // educational/visualization deviation, not an AD4 parameter.
        const optimalDistance =
          (acceptorParameter.hydrogenBondRadius || 1.9) + (donorIsHydrogen ? 0 : 1);
        const maximumDistance = optimalDistance + options.hydrogenBondMaximumOffset;
        if (distance <= maximumDistance) {
          const geometry = hBondGeometry(hBond, options);
          const ratio = optimalDistance / Math.max(distance, 0.5);
          const ratio10 = ratio ** 10;
          const radial =
            Math.max(acceptorParameter.hydrogenBondEpsilon, donorParameter.hydrogenBondEpsilon, 1) *
            (5 * ratio10 * ratio * ratio - 6 * ratio10);
          const rawHydrogenBond = radial * geometry.factor;
          const weightedHydrogenBond = clamp(
            rawHydrogenBond * options.weights.hydrogenBond,
            -options.maxHydrogenBondAttraction,
            options.maxHydrogenBondRepulsion,
          );
          rawTerms.hydrogenBond += rawHydrogenBond;
          terms.hydrogenBond += weightedHydrogenBond;

          if (weightedHydrogenBond < -1e-6 &&
              hydrogenBonds.length < options.maxReportedInteractions) {
            hydrogenBonds.push({
              receptorAtomId: receptorAtom.id,
              ligandAtomId: ligandAtom.id,
              distance: rounded(distance),
              donorAtomId: hBond.donor.id,
              acceptorAtomId: hBond.acceptor.id,
              donorAlignment: hBond.donor.donorDirection
                ? rounded(geometry.donorAlignment ?? 0)
                : null,
              acceptorAlignment: hBond.acceptor.acceptorDirection
                ? rounded(geometry.acceptorAlignment ?? 0)
                : null,
              geometryFactor: rounded(geometry.factor),
              energy: rounded(weightedHydrogenBond),
            });
          }
        }
      }

      if (distance < options.electrostaticsCutoff) {
        const electrostaticDistance = Math.max(distance, options.minimumElectrostaticDistance);
        const dielectric = distanceDependentDielectric(electrostaticDistance);
        const rawElectrostatics =
          (COULOMB_KCAL_ANGSTROM * receptorAtom.partialCharge * ligandAtom.partialCharge) /
          (dielectric * electrostaticDistance);
        const weightedElectrostatics = clamp(
          rawElectrostatics * options.weights.electrostatics,
          -options.maxElectrostaticMagnitude,
          options.maxElectrostaticMagnitude,
        );
        rawTerms.electrostatics += rawElectrostatics;
        terms.electrostatics += weightedElectrostatics;
      }

      if (distance < options.desolvationCutoff) {
        // Huey et al. charge-based desolvation:
        // ((S_i + QASP|q_i|)V_j + (S_j + QASP|q_j|)V_i)
        // * exp(-r^2 / (2 sigma^2)), sigma=3.6 A.
        const receptorSolvation =
          receptorParameter.solvationParameter +
          options.chargeAbsoluteSolvationParameter * Math.abs(receptorAtom.partialCharge);
        const ligandSolvation =
          ligandParameter.solvationParameter +
          options.chargeAbsoluteSolvationParameter * Math.abs(ligandAtom.partialCharge);
        const gaussian = Math.exp(
          -distanceSquared / (2 * options.desolvationSigma * options.desolvationSigma),
        );
        const rawDesolvation =
          (receptorSolvation * ligandParameter.volume +
            ligandSolvation * receptorParameter.volume) *
          gaussian;
        const weightedDesolvation = clamp(
          rawDesolvation * options.weights.desolvation,
          -options.maxDesolvationMagnitude,
          options.maxDesolvationMagnitude,
        );
        rawTerms.desolvation += rawDesolvation;
        terms.desolvation += weightedDesolvation;
      }

      const clashThreshold = equilibriumDistance * options.clashDistanceScale;
      // Explicit donor-H...acceptor contacts are the intended close-contact
      // geometry in AD4 and must not be double-labelled as steric clashes.
      if (distance < clashThreshold && !explicitHydrogenBond) {
        const overlap = clashThreshold - distance;
        const severity = clashThreshold > 0 ? clamp(overlap / clashThreshold, 0, 1) : 0;
        clashCount += 1;
        clashSeverity += severity;
        if (clashPairs.length < options.maxReportedInteractions) {
          clashPairs.push({
            receptorAtomId: receptorAtom.id,
            ligandAtomId: ligandAtom.id,
            distance: rounded(distance),
            overlap: rounded(overlap),
            severity: rounded(severity),
          });
        }
      }

      if (distance <= options.contactDistance && contacts.length < options.maxReportedInteractions) {
        contacts.push({
          receptorAtomId: receptorAtom.id,
          ligandAtomId: ligandAtom.id,
          distance: rounded(distance),
          kind: contactKind(receptorAtom, ligandAtom),
        });
      }
    }
  }

  const roundedTerms: ScoreTerms = {
    vanDerWaals: rounded(terms.vanDerWaals),
    hydrogenBond: rounded(terms.hydrogenBond),
    electrostatics: rounded(terms.electrostatics),
    desolvation: rounded(terms.desolvation),
  };
  const roundedRawTerms: ScoreTerms = {
    vanDerWaals: rounded(rawTerms.vanDerWaals),
    hydrogenBond: rounded(rawTerms.hydrogenBond),
    electrostatics: rounded(rawTerms.electrostatics),
    desolvation: rounded(rawTerms.desolvation),
  };
  const total = rounded(
    roundedTerms.vanDerWaals +
      roundedTerms.hydrogenBond +
      roundedTerms.electrostatics +
      roundedTerms.desolvation,
  );

  return {
    model: SCORING_MODEL_NAME,
    terms: roundedTerms,
    rawTerms: roundedRawTerms,
    total,
    clashes: {
      count: clashCount,
      severity: rounded(clashSeverity),
      pairs: clashPairs,
    },
    hydrogenBonds,
    contacts,
    evaluatedPairs,
  };
}

/**
 * Deterministically rank a crystal pose and explicit decoy panel. This is the
 * fixture hook for a prepared public/data manifest: pass the crystal as one
 * entry, add displaced/rotated decoys, and verify the expected ordering.
 */
export function scorePosePanel(
  receptor: readonly MolecularAtom[],
  ligand: readonly MolecularAtom[],
  panel: readonly PosePanelEntry[],
  overrides?: ScoringOverrides,
): ScoredPosePanelEntry[] {
  return panel
    .map((entry) => ({
      ...entry,
      score: scorePose(receptor, ligand, entry.pose, overrides),
    }))
    .sort((left, right) => left.score.total - right.score.total || left.id.localeCompare(right.id));
}
