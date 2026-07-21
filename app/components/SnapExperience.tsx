"use client";

import {
  Check,
  CircleAlert,
  Eye,
  FlaskConical,
  Grab,
  RotateCcw,
  ScanSearch,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MolecularStage,
  type LigandAtomHighlight,
  type MolecularInteraction,
  type MolecularPose,
  type MolecularSystem,
  type ScoreBreakdown as StageScore,
} from "./MolecularStage";
import {
  LearningChallenge,
  type LearningChallengeReceipt,
  type LearningChallengePoseState,
} from "./LearningChallenge";
import {
  TwoTargetObservationRecord,
  upsertTargetObservation,
  type TwoTargetObservations,
} from "./TwoTargetObservationRecord";
import {
  captureFirstContactTransferResult,
  EMPTY_CONTACT_TRANSFER_STATE,
  lockContactTransferPrediction,
  recordThreeCeThreeExposure,
  type CandidateContactPrediction,
  type ContactTransferState,
} from "./ContactCountTransferLab";
import {
  scorePose,
  scorePoseWithAutoGrid,
  type AutoGridMapSet,
  type LigandPose,
  type MolecularAtom as ScoringAtom,
} from "../lib/scoring";
import {
  CONTRIBUTION_TONE_STYLES,
  createContributionLens,
  type ContributionLensResult,
} from "../lib/contributionLens";
import "./snap-experience.css";

type Vec3 = [number, number, number];
type QuaternionTuple = [number, number, number, number];

const CONTRIBUTION_TONE_ORDER = [
  "favorable",
  "neutral",
  "unfavorable",
] as const;

interface StructureAtom {
  id: string | number;
  element: string;
  name?: string;
  residueName?: string;
  residueNumber?: number;
  chainId?: string;
  position?: Vec3;
  x?: number;
  y?: number;
  z?: number;
  partialCharge?: number;
  autodockType?: string;
}

interface StructureBond {
  a?: string | number;
  b?: string | number;
  from?: number;
  to?: number;
  order?: number;
}

interface PreparedSystem {
  schemaVersion: string;
  system: {
    id: string;
    name: string;
    entryId: string;
    ligand: { ccdId: string; name: string; formula?: string };
    method?: string;
    resolutionAngstrom?: number;
    sourceUrl: string;
    license: string;
    scope?: string;
    limitations?: string[];
  };
  frame: {
    center: Vec3;
    pocketCenter: Vec3;
    referenceLigandCentroid: Vec3;
    coordinateUnits: string;
  };
  receptor: {
    atoms: StructureAtom[];
    bonds?: StructureBond[];
    chainId?: string;
  };
  ligand: {
    atoms: StructureAtom[];
    bonds?: StructureBond[];
    referencePose: { positions: Vec3[] };
    formalCharge?: number;
  };
  pocket?: {
    residues?: string[];
    cutoffAngstrom?: number;
    residueCutoffAngstrom?: number;
  };
  scoring: {
    autoGridManifest: string;
    referencePoseScore?: number;
    interpretation?: string;
  };
  validation?: {
    gridChecks?: {
      referenceCrystalPoseScore?: number;
      translated0_5AngstromScore?: number;
      translatedXMinus1AngstromScore?: number;
      translatedZPlus1AngstromScore?: number;
      rotated15DegreesScore?: number;
    };
  };
}

interface AutoGridDocument {
  schemaVersion: string;
  autoGrid: {
    spacing: number;
    dimensions: { x: number; y: number; z: number };
    center: Vec3;
    origin: Vec3;
    channelOrder: string[];
    maps?: Record<string, number[]>;
    binary?: {
      url: string;
      dtype: "float32";
      endianness: "little";
      layout: "channel-major";
      valuesPerChannel: number;
      byteOffsets: Record<string, number>;
      sha256?: string;
    };
    provenance?: Record<string, unknown>;
    validation?: Record<string, unknown>;
  };
}

interface ModelBundle {
  stageSystem: MolecularSystem;
  receptor: ScoringAtom[];
  ligand: ScoringAtom[];
  receptorIndex: Map<string, number>;
  ligandIndex: Map<string, number>;
  crystalPose: MolecularPose;
  initialPose: MolecularPose;
  ligandCentroid: Vec3;
}

interface VisibleScore {
  total: number;
  normalized: number;
  terms: {
    affinity: number;
    electrostatics: number;
    desolvation: number;
    outsideGridPenalty: number;
  };
  clashes: number;
  hydrogenBonds: number;
  evaluatedPairs: number;
  outsideGridAtoms: number;
}

interface ContactReadout {
  id: string;
  residue: string;
  distance: number;
}

type ExperienceMode =
  | "loading"
  | "intro"
  | "explore"
  | "revealing"
  | "locked"
  | "error";

type TargetId = "1stp" | "3ce3";

interface TargetDefinition {
  id: TargetId;
  entryId: string;
  assetUrl: string;
  selectorLabel: string;
  selectorDetail: string;
  disclosure: string;
  ligandShortName: string;
  learningContextLabel: string;
  observationContextLabel: string;
  visualBadScoreKey:
    | "rotated15DegreesScore"
    | "translatedZPlus1AngstromScore";
  loadingLabel: string;
  introKicker: string;
  introTitle: string;
  introBody: string;
  introBoundary: string;
  stageAriaLabel: string;
  modelBoundary: string;
  geometryBoundary: string;
  proofReference: string;
  translation: {
    label: string;
    description: string;
    scoreKey:
      | "translated0_5AngstromScore"
      | "translatedXMinus1AngstromScore";
  };
  rotationDescription: string;
}

const TARGETS: Record<TargetId, TargetDefinition> = {
  "1stp": {
    id: "1stp",
    entryId: "1STP",
    assetUrl: "/data/1stp-biotin.json",
    selectorLabel: "Streptavidin · biotin",
    selectorDetail: "canonical teaching pair",
    disclosure: "Prepared chain A field · public heavy-atom co-crystal pose",
    ligandShortName: "biotin",
    learningContextLabel: "1STP · streptavidin / biotin",
    observationContextLabel: "Streptavidin · biotin",
    visualBadScoreKey: "rotated15DegreesScore",
    loadingLabel: "Loading PDB 1STP and its prepared AutoGrid field",
    introKicker: "A real molecule. A prepared scoring field.",
    introTitle: "Fit biotin into the pocket.",
    introBody:
      "Grab biotin and move it through the prepared 1STP pocket. The local score and contact markers update with every move.",
    introBoundary: "PDB-derived prepared input · rigid molecules · simplified score",
    stageAriaLabel: "Fit biotin into the prepared streptavidin chain A pocket",
    modelBoundary:
      "Rigid single-chain model. No flexibility or pose search. Built for intuition, not drug discovery predictions.",
    geometryBoundary:
      "Contact and clash overlays are explanatory geometry checks; they do not enter the AutoGrid total.",
    proofReference: "PDB-derived prepared input from 1STP",
    translation: {
      label: "Move 0.5 Å",
      description: "A half ångström displacement weakens the local score",
      scoreKey: "translated0_5AngstromScore",
    },
    rotationDescription: "A small rotation creates an unfavorable contact field",
  },
  "3ce3": {
    id: "3ce3",
    entryId: "3CE3",
    assetUrl: "/data/3ce3-system.json",
    selectorLabel: "c-MET kinase · 1FN",
    selectorDetail: "same engine · separate maps",
    disclosure: "Experimental 1FN · five frozen torsions · not an approved medicine",
    ligandShortName: "1FN",
    learningContextLabel: "3CE3 · c-MET / experimental inhibitor 1FN",
    observationContextLabel: "c-MET · experimental inhibitor 1FN",
    visualBadScoreKey: "translatedZPlus1AngstromScore",
    loadingLabel: "Loading PDB 3CE3 and its target-specific AutoGrid field",
    introKicker: "A second target. The same live scoring path.",
    introTitle: "Fit 1FN into the c-MET pocket.",
    introBody:
      "Move the experimental inhibitor through the prepared 3CE3 kinase pocket. The same browser engine now samples a different target-specific field.",
    introBoundary:
      "Experimental ligand · five frozen torsions · not an approved medicine",
    stageAriaLabel: "Fit experimental inhibitor 1FN into the prepared c-MET kinase pocket",
    modelBoundary:
      "Rigid prepared kinase model with no pose search or affinity prediction. Five ligand torsions remain frozen. 1FN is experimental, not an approved medicine.",
    geometryBoundary:
      "One clash marker remains at the prepared 3CE3 input. This separate geometry heuristic does not enter the AutoGrid total or invalidate the experiment; its 41 inferred bonds are display-only.",
    proofReference: "PDB-derived prepared input from 3CE3",
    translation: {
      label: "Move −1 Å on x",
      description: "A one ångström displacement weakens the target-specific score",
      scoreKey: "translatedXMinus1AngstromScore",
    },
    rotationDescription: "A 15° rotation creates a strong repulsive field",
  },
};

const TARGET_ORDER: TargetId[] = ["1stp", "3ce3"];

const IDENTITY_ROTATION: QuaternionTuple = [0, 0, 0, 1];
const START_ROTATION: QuaternionTuple = [
  0,
  0,
  Math.sin(Math.PI / 24),
  Math.cos(Math.PI / 24),
];
const ACCEPTOR_TYPES = new Set(["NA", "NS", "OA", "OS", "SA"]);
const DONOR_TYPES = new Set(["HD", "HS"]);
const VDW_RADII: Record<string, number> = {
  H: 1.2,
  C: 1.7,
  N: 1.55,
  O: 1.52,
  F: 1.47,
  P: 1.8,
  S: 1.8,
  CL: 1.75,
  BR: 1.85,
  I: 1.98,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function focusMolecularStage(): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(".molecular-stage")?.focus();
  });
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function atomPosition(atom: StructureAtom): Vec3 {
  if (atom.position?.length === 3 && atom.position.every(Number.isFinite)) {
    return atom.position;
  }
  if ([atom.x, atom.y, atom.z].every((value) => Number.isFinite(value))) {
    return [atom.x as number, atom.y as number, atom.z as number];
  }
  throw new TypeError(`Atom ${atom.id} is missing a finite position.`);
}

function scoreVector(position: Vec3) {
  return { x: position[0], y: position[1], z: position[2] };
}

function formatTerm(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function makeScoringAtom(atom: StructureAtom): ScoringAtom {
  const autodockType = atom.autodockType?.trim();
  if (!autodockType || !Number.isFinite(atom.partialCharge)) {
    throw new TypeError(
      `Prepared atom ${atom.id} is missing an AutoDock type or partial charge.`,
    );
  }
  const normalizedType = autodockType.toUpperCase();
  return {
    id: String(atom.id),
    name: atom.name,
    residueName: atom.residueName,
    residueNumber: atom.residueNumber,
    chain: atom.chainId,
    position: scoreVector(atomPosition(atom)),
    element: atom.element,
    autodockType,
    partialCharge: atom.partialCharge as number,
    donor: DONOR_TYPES.has(normalizedType),
    acceptor: ACCEPTOR_TYPES.has(normalizedType),
  };
}

function assertPreparedSystemContract(
  system: PreparedSystem,
  target: TargetDefinition,
): void {
  if (system.system.entryId.trim().toUpperCase() !== target.entryId) {
    throw new Error(
      `Loaded ${system.system.entryId || "unknown entry"} while ${target.entryId} was selected.`,
    );
  }

  const reference = system.ligand.referencePose?.positions;
  if (!reference || reference.length !== system.ligand.atoms.length) {
    throw new Error("The prepared ligand reference pose does not match its atom list.");
  }

  reference.forEach((position, index) => {
    if (position.length !== 3 || !position.every(Number.isFinite)) {
      throw new Error(`Reference ligand atom ${index} has an invalid coordinate.`);
    }
    const atom = atomPosition(system.ligand.atoms[index]);
    const delta = Math.hypot(
      atom[0] - position[0],
      atom[1] - position[1],
      atom[2] - position[2],
    );
    if (delta > 1e-5) {
      throw new Error(
        `Prepared ligand atom ${index} differs from the reference pose by ${delta.toFixed(5)} Å.`,
      );
    }
  });
}

function buildModelBundle(system: PreparedSystem): ModelBundle {
  const ligandCentroid = system.frame.referenceLigandCentroid;
  const pocketCutoff =
    system.pocket?.cutoffAngstrom ??
    system.pocket?.residueCutoffAngstrom ??
    5;
  const pocketCutoffSquared = pocketCutoff * pocketCutoff;
  const ligandReference = system.ligand.atoms.map(atomPosition);
  const receptor = system.receptor.atoms.map((atom) =>
    makeScoringAtom({
      ...atom,
      chainId: atom.chainId ?? system.receptor.chainId,
    }),
  );
  const ligand = system.ligand.atoms.map(makeScoringAtom);

  const pocketAtomIds = new Set(
    system.receptor.atoms
      .filter((atom) => {
        const position = atomPosition(atom);
        return ligandReference.some((ligandPosition) => {
          const dx = position[0] - ligandPosition[0];
          const dy = position[1] - ligandPosition[1];
          const dz = position[2] - ligandPosition[2];
          return dx * dx + dy * dy + dz * dz <= pocketCutoffSquared;
        });
      })
      .map((atom) => String(atom.id)),
  );

  const ligandIndex = new Map(
    system.ligand.atoms.map((atom, index) => [String(atom.id), index]),
  );
  const receptorIndex = new Map(
    system.receptor.atoms.map((atom, index) => [String(atom.id), index]),
  );
  const bonds = (system.ligand.bonds ?? []).flatMap((bond) => {
    const from =
      bond.from ??
      (bond.a === undefined ? undefined : ligandIndex.get(String(bond.a)));
    const to =
      bond.to ??
      (bond.b === undefined ? undefined : ligandIndex.get(String(bond.b)));
    if (from === undefined || to === undefined) return [];
    const order = Math.min(3, Math.max(1, bond.order ?? 1)) as 1 | 2 | 3;
    return [{ from, to, order }];
  });

  const stageSystem: MolecularSystem = {
    id: system.system.id,
    name: `${system.system.entryId.toUpperCase()} · ${system.system.ligand.name}`,
    pocketCenter: system.frame.pocketCenter,
    receptor: {
      atoms: system.receptor.atoms.map((atom) => ({
        id: String(atom.id),
        element: atom.element,
        position: atomPosition(atom),
        radius: VDW_RADII[atom.element.trim().toUpperCase()] ?? 1.6,
        pocket: pocketAtomIds.has(String(atom.id)),
      })),
    },
    ligand: {
      atoms: system.ligand.atoms.map((atom) => ({
        id: String(atom.id),
        element: atom.element,
        position: subtract(atomPosition(atom), ligandCentroid),
        radius: VDW_RADII[atom.element.trim().toUpperCase()] ?? 1.6,
      })),
      bonds,
    },
  };

  const crystalPose: MolecularPose = {
    position: ligandCentroid,
    rotation: IDENTITY_ROTATION,
  };
  const initialPose: MolecularPose = {
    position: ligandCentroid,
    rotation: START_ROTATION,
  };

  return {
    stageSystem,
    receptor,
    ligand,
    receptorIndex,
    ligandIndex,
    crystalPose,
    initialPose,
    ligandCentroid,
  };
}

function isLittleEndian(): boolean {
  const bytes = new Uint8Array(new Uint16Array([1]).buffer);
  return bytes[0] === 1;
}

function readFloatChannel(
  buffer: ArrayBuffer,
  byteOffset: number,
  count: number,
): Float32Array {
  const byteLength = count * Float32Array.BYTES_PER_ELEMENT;
  if (byteOffset < 0 || byteOffset + byteLength > buffer.byteLength) {
    throw new RangeError("AutoGrid binary channel is outside the downloaded file.");
  }
  if (isLittleEndian()) {
    return new Float32Array(buffer.slice(byteOffset, byteOffset + byteLength));
  }
  const view = new DataView(buffer, byteOffset, byteLength);
  return Float32Array.from({ length: count }, (_, index) =>
    view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true),
  );
}

async function hydrateAutoGrid(
  document: AutoGridDocument,
  signal?: AbortSignal,
): Promise<AutoGridMapSet> {
  const prepared = document.autoGrid;
  const count =
    prepared.dimensions.x * prepared.dimensions.y * prepared.dimensions.z;
  let channels: Record<string, Float32Array> = {};

  if (prepared.binary) {
    try {
      const response = await fetch(prepared.binary.url, { signal });
      if (!response.ok) {
        throw new Error(`AutoGrid binary returned ${response.status}.`);
      }
      const buffer = await response.arrayBuffer();
      channels = Object.fromEntries(
        prepared.channelOrder.map((channel) => [
          channel,
          readFloatChannel(
            buffer,
            prepared.binary?.byteOffsets[channel] ?? -1,
            prepared.binary?.valuesPerChannel ?? count,
          ),
        ]),
      );
    } catch {
      channels = {};
    }
  }

  if (!channels.e || !channels.d) {
    channels = Object.fromEntries(
      prepared.channelOrder.map((channel) => {
        const values = prepared.maps?.[channel];
        if (!values || values.length !== count) {
          throw new RangeError(
            `AutoGrid channel ${channel} has ${values?.length ?? 0} values; expected ${count}.`,
          );
        }
        return [channel, Float32Array.from(values)];
      }),
    );
  }

  const affinityMaps = Object.fromEntries(
    prepared.channelOrder
      .filter((channel) => channel !== "e" && channel !== "d")
      .map((channel) => [channel, channels[channel]]),
  );

  return {
    spacing: prepared.spacing,
    dimensions: prepared.dimensions,
    center: scoreVector(prepared.center),
    origin: scoreVector(prepared.origin),
    affinityMaps,
    electrostaticsMap: channels.e,
    desolvationMap: channels.d,
  };
}

function toLigandPose(pose: MolecularPose, centroid: Vec3): LigandPose {
  const translation = subtract([...pose.position] as Vec3, centroid);
  return {
    translation: scoreVector(translation),
    rotation: {
      x: pose.rotation[0],
      y: pose.rotation[1],
      z: pose.rotation[2],
      w: pose.rotation[3],
    },
    pivot: scoreVector(centroid),
  };
}

function interpolatePose(
  from: MolecularPose,
  to: MolecularPose,
  progress: number,
): MolecularPose {
  const position = from.position.map(
    (value, index) => value + (to.position[index] - value) * progress,
  ) as Vec3;
  const dot = from.rotation.reduce(
    (sum, value, index) => sum + value * to.rotation[index],
    0,
  );
  const target = dot < 0 ? to.rotation.map((value) => -value) : to.rotation;
  const rotation = from.rotation.map(
    (value, index) => value + (target[index] - value) * progress,
  ) as QuaternionTuple;
  const magnitude = Math.hypot(...rotation) || 1;
  return {
    position,
    rotation: rotation.map((value) => value / magnitude) as QuaternionTuple,
  };
}

function ScoreDial({ score }: { score: VisibleScore | null }) {
  const normalized = score?.normalized ?? 0;
  const degrees = -126 + normalized * 252;

  return (
    <div className="score-dial" aria-label="Current AutoGrid local pose score">
      <div className="dial-face">
        <span className="dial-track" />
        <motion.span
          className="dial-needle"
          animate={{ rotate: degrees }}
          transition={{ type: "spring", stiffness: 170, damping: 24 }}
        />
        <span className="dial-pivot" />
        <div className="dial-reading">
          <strong>
            {score
              ? score.outsideGridAtoms > 0
                ? "OUT"
                : score.total.toFixed(2)
              : "—"}
          </strong>
          <span>local pose score</span>
        </div>
      </div>
      <div className="dial-scale" aria-hidden="true">
        <span>poor fit</span>
        <span>better fit</span>
      </div>
      <p>Lower is better. Not a predicted binding affinity.</p>
    </div>
  );
}

function TermLedger({ score }: { score: VisibleScore | null }) {
  const terms = [
    { label: "Atom-type map", value: score?.terms.affinity, tone: "shape" },
    { label: "Electrostatics", value: score?.terms.electrostatics, tone: "charge" },
    { label: "Desolvation", value: score?.terms.desolvation, tone: "solvation" },
    { label: "Grid limit", value: score?.terms.outsideGridPenalty, tone: "hbond" },
  ];

  return (
    <div className="term-ledger" aria-label="AutoGrid score components">
      {terms.map((term) => (
        <div className="term" data-tone={term.tone} key={term.label}>
          <span>{term.label}</span>
          <strong>{formatTerm(term.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function ScoreTrace({
  values,
  baseline,
  outsideGrid,
}: {
  values: number[];
  baseline: number;
  outsideGrid: boolean;
}) {
  const chartValues = [baseline, ...values].filter(Number.isFinite);
  const observedMinimum = Math.min(...chartValues);
  const observedMaximum = Math.max(...chartValues);
  const observedSpan = observedMaximum - observedMinimum;
  const chartPadding =
    observedSpan > 0
      ? Math.max(0.5, observedSpan * 0.1)
      : Math.max(1, Math.abs(observedMaximum) * 0.05);
  const chartMinimum = observedMinimum - chartPadding;
  const chartMaximum = observedMaximum + chartPadding;
  const chartSpan = Math.max(0.1, chartMaximum - chartMinimum);
  const zeroLineY = 34 - ((0 - chartMinimum) / chartSpan) * 32;
  const points = values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
      const clamped = Math.min(chartMaximum, Math.max(chartMinimum, value));
      const y = 34 - ((clamped - chartMinimum) / chartSpan) * 32;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const current = values.at(-1);
  const improvement = current === undefined ? 0 : baseline - current;
  const comparison =
    outsideGrid
      ? "outside grid"
      : values.length <= 1
      ? "baseline"
      : improvement >= 0
        ? `${improvement.toFixed(2)} better`
        : `${Math.abs(improvement).toFixed(2)} worse`;
  const spokenComparison =
    comparison === "baseline"
      ? "at the 15 degree challenge baseline"
      : `${comparison} than the 15 degree challenge pose`;

  return (
    <div
      className="score-trace"
      aria-label={
        outsideGrid
          ? "Pose trace paused because part of the molecule is outside the prepared grid."
          : current === undefined
          ? "No recent pose scores"
          : `Recent local pose scores. Current ${current.toFixed(2)}, ${spokenComparison}.`
      }
    >
      <div>
        <span>Live pose trace</span>
        <strong>{comparison}</strong>
      </div>
      <svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
        {chartMinimum <= 0 && chartMaximum >= 0 ? (
          <line x1="0" y1={zeroLineY} x2="100" y2={zeroLineY} />
        ) : null}
        {points && <polyline points={points} />}
      </svg>
    </div>
  );
}

function formatDelta(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return "0.00";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;
}

function AtomContributionLens({
  enabled,
  onToggle,
  lens,
  state,
  ligandAtoms,
  fallback,
}: {
  enabled: boolean;
  onToggle: () => void;
  lens: Readonly<ContributionLensResult> | null;
  state: "ready" | "outside-grid" | "invalid" | "unavailable";
  ligandAtoms: readonly ScoringAtom[];
  fallback: ReactNode;
}) {
  const hasVisibleChange =
    (lens?.topContributors[0]?.absoluteTotalDelta ?? 0) >= 0.005;

  return (
    <section className="atom-lens" aria-label="Per-ligand-atom contribution lens">
      <button
        className="atom-lens__toggle"
        type="button"
        aria-pressed={enabled}
        disabled={state === "unavailable"}
        onClick={onToggle}
      >
        <span><ScanSearch size={15} /> Atom contribution lens</span>
        <span className="atom-lens__state">{enabled ? "On" : "Off"}</span>
      </button>

      {!enabled ? fallback : (
        <div className="atom-lens__panel">
          <div className="atom-lens__legend" aria-label="Contribution color key">
            {CONTRIBUTION_TONE_ORDER.map((tone) => {
              const style = CONTRIBUTION_TONE_STYLES[tone];
              return (
                <span
                  key={tone}
                  style={{ "--legend-color": style.hex } as CSSProperties}
                >
                  <i /> {style.label}
                </span>
              );
            })}
          </div>
          <p className="atom-lens__intro">
            Current minus this target&apos;s exact 15° challenge pose. Negative
            atom deltas are more favorable in the prepared field.
          </p>

          {state === "outside-grid" ? (
            <p className="atom-lens__paused" role="status">
              Lens paused. Return every ligand atom inside the prepared grid.
            </p>
          ) : state === "invalid" ? (
            <p className="atom-lens__paused" role="status">
              Lens hidden because the atom-sum conservation check did not verify.
            </p>
          ) : lens ? (
            <>
              {hasVisibleChange ? (
                <ol className="atom-lens__drivers" aria-label="Largest absolute atom contribution changes">
                  {lens.topContributors.map((contribution) => {
                    const atom = ligandAtoms[contribution.atomIndex];
                    const label = atom?.name?.trim() || `Atom ${contribution.atomId}`;
                    return (
                      <li
                        className="atom-lens__driver"
                        key={contribution.atomId}
                        style={{ "--driver-color": contribution.style.hex } as CSSProperties}
                      >
                        <b>{label} · {contribution.mapType}</b>
                        <strong>{formatDelta(contribution.delta.total)}</strong>
                        <small>
                          {contribution.style.label} · map {formatDelta(contribution.delta.affinity)} · electro {formatDelta(contribution.delta.electrostatics)} · solv {formatDelta(contribution.delta.desolvation)}
                        </small>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="atom-lens__paused">
                  No per-atom change reaches the 0.005 display threshold. The
                  conservation check still uses the underlying scorer values
                  before two-decimal display rounding.
                </p>
              )}
              <div className="atom-lens__verification">
                <Check size={13} aria-hidden="true" />
                <span>
                  Sum verified: Σ atom Δ {formatDelta(lens.conservation.atomSumDelta.total)} = pose Δ {formatDelta(lens.totalDelta)}
                </span>
              </div>
            </>
          ) : null}

          <p className="atom-lens__boundary">
            Per-ligand-atom grid samples only. Not receptor-residue energies,
            binding affinity, or a cross-target comparison.
          </p>
        </div>
      )}
    </section>
  );
}

function LoadingSpecimen({ label }: { label: string }) {
  return (
    <div className="loading-specimen" role="status">
      <div className="loading-orbit">
        <i />
        <i />
        <i />
      </div>
      <span>{label}</span>
    </div>
  );
}

function readoutFor(
  score: VisibleScore | null,
  mode: ExperienceMode,
  target: TargetDefinition,
): string {
  if (!score) return "The numerical readout appears after the structure and grid load.";
  if (mode === "locked") {
    return "This is the prepared co-crystal input pose. The target-specific field ranks it above our defined decoys.";
  }
  if (score.outsideGridAtoms > 0) {
    return `Part of ${target.ligandShortName} has left the prepared grid. Move it back toward the pocket.`;
  }
  if (score.clashes > 0) {
    return `Red markers show atoms pushed too close together. Move or rotate ${target.ligandShortName} to clear the overlap.`;
  }
  if (score.normalized > 0.82) {
    return "The local field now favors this pose. Reveal the prepared reference to compare it with the co-crystal input.";
  }
  if (score.hydrogenBonds > 0) {
    return "Cyan lines mark plausible hydrogen bond geometry. Keep them while lowering the local score.";
  }
  return `Move ${target.ligandShortName} through the pocket. Lower the score and watch for contact geometry without forcing atoms together.`;
}

export function SnapExperience() {
  const [selectedTarget, setSelectedTarget] = useState<TargetId>("1stp");
  const [mode, setMode] = useState<ExperienceMode>("loading");
  const [system, setSystem] = useState<PreparedSystem | null>(null);
  const [grid, setGrid] = useState<AutoGridMapSet | null>(null);
  const [pose, setPose] = useState<MolecularPose>({
    position: [0, 0, 0],
    rotation: START_ROTATION,
  });
  const [muted, setMuted] = useState(false);
  const [atomLensEnabled, setAtomLensEnabled] = useState(false);
  const [targetObservations, setTargetObservations] =
    useState<TwoTargetObservations>({});
  const [contactTransferState, setContactTransferState] =
    useState<ContactTransferState>(EMPTY_CONTACT_TRANSFER_STATE);
  const [hasMoved, setHasMoved] = useState(false);
  const [scoreTrace, setScoreTrace] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const revealFrame = useRef<number | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const lockArmed = useRef(true);
  const activeTarget = TARGETS[selectedTarget];

  const handleTargetSelect = useCallback(
    (targetId: TargetId) => {
      if (targetId === selectedTarget) return;
      if (targetId === "3ce3") {
        setContactTransferState((current) =>
          recordThreeCeThreeExposure(current),
        );
      }
      if (revealFrame.current !== null) {
        cancelAnimationFrame(revealFrame.current);
        revealFrame.current = null;
      }
      lockArmed.current = true;
      setMode("loading");
      setSystem(null);
      setGrid(null);
      setError(null);
      setHasMoved(false);
      setScoreTrace([]);
      setSelectedTarget(targetId);
    },
    [selectedTarget],
  );

  const handleObservationTargetSelect = useCallback(
    (targetId: TargetId) => {
      handleTargetSelect(targetId);
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLButtonElement>(`[data-target-id="${targetId}"]`)
          ?.focus();
      });
    },
    [handleTargetSelect],
  );

  const handleLearningComplete = useCallback(
    (receipt: LearningChallengeReceipt) => {
      setTargetObservations((current) =>
        upsertTargetObservation(
          current,
          selectedTarget,
          activeTarget.observationContextLabel,
          receipt,
        ),
      );
      if (selectedTarget === "3ce3") {
        setContactTransferState((current) =>
          captureFirstContactTransferResult(current, receipt),
        );
      }
    },
    [activeTarget.observationContextLabel, selectedTarget],
  );

  const handleLockContactPrediction = useCallback(
    (prediction: CandidateContactPrediction) => {
      setContactTransferState((current) =>
        lockContactTransferPrediction(current, prediction),
      );
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadSystem() {
      try {
        const response = await fetch(activeTarget.assetUrl, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Structure asset returned ${response.status}.`);
        const prepared = (await response.json()) as PreparedSystem;
        if (!prepared.receptor?.atoms?.length || !prepared.ligand?.atoms?.length) {
          throw new Error("The prepared structure is missing receptor or ligand atoms.");
        }
        assertPreparedSystemContract(prepared, activeTarget);
        if (!prepared.scoring?.autoGridManifest) {
          throw new Error("The prepared structure does not name its AutoGrid manifest.");
        }
        const gridResponse = await fetch(prepared.scoring.autoGridManifest, {
          signal: controller.signal,
        });
        if (!gridResponse.ok) {
          throw new Error(`AutoGrid manifest returned ${gridResponse.status}.`);
        }
        const gridDocument = (await gridResponse.json()) as AutoGridDocument;
        const preparedGrid = await hydrateAutoGrid(
          gridDocument,
          controller.signal,
        );
        const bundle = buildModelBundle(prepared);
        scorePoseWithAutoGrid(
          preparedGrid,
          bundle.ligand,
          toLigandPose(bundle.crystalPose, bundle.ligandCentroid),
        );

        if (!cancelled) {
          setSystem(prepared);
          setGrid(preparedGrid);
          setPose(bundle.initialPose);
          setError(null);
          setMode("intro");
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "The prepared structure could not load.",
          );
          setMode("error");
        }
      }
    }

    loadSystem();
    return () => {
      cancelled = true;
      controller.abort();
      if (revealFrame.current !== null) cancelAnimationFrame(revealFrame.current);
    };
  }, [activeTarget]);

  const bundle = useMemo(
    () => (system ? buildModelBundle(system) : null),
    [system],
  );

  const scoring = useMemo(() => {
    if (!bundle || !grid) return null;
    const ligandPose = toLigandPose(pose, bundle.ligandCentroid);
    const autoGrid = scorePoseWithAutoGrid(grid, bundle.ligand, ligandPose);
    const geometry = scorePose(bundle.receptor, bundle.ligand, ligandPose);
    const crystal = scorePoseWithAutoGrid(
      grid,
      bundle.ligand,
      toLigandPose(bundle.crystalPose, bundle.ligandCentroid),
    );
    const initial = scorePoseWithAutoGrid(
      grid,
      bundle.ligand,
      toLigandPose(bundle.initialPose, bundle.ligandCentroid),
    );
    const visualBadAnchor =
      system?.validation?.gridChecks?.[activeTarget.visualBadScoreKey] ??
      initial.total;
    const span = Math.max(0.1, visualBadAnchor - crystal.total);
    const normalized = clamp01((visualBadAnchor - autoGrid.total) / span);

    const visible: VisibleScore = {
      total: autoGrid.total,
      normalized,
      terms: autoGrid.terms,
      clashes: geometry.clashes.count,
      hydrogenBonds: geometry.hydrogenBonds.length,
      evaluatedPairs: geometry.evaluatedPairs,
      outsideGridAtoms: autoGrid.outsideGridAtoms,
    };
    return { autoGrid, geometry, visible, initial };
  }, [activeTarget.visualBadScoreKey, bundle, grid, pose, system]);

  const atomLens = useMemo<{
    result: Readonly<ContributionLensResult> | null;
    state: "ready" | "outside-grid" | "invalid" | "unavailable";
  }>(() => {
    if (!system || !scoring) return { result: null, state: "unavailable" };
    if (scoring.autoGrid.outsideGridAtoms > 0) {
      return { result: null, state: "outside-grid" };
    }
    try {
      return {
        result: createContributionLens(
          {
            systemId: system.system.id,
            poseLabel: "exact 15° challenge pose",
            score: scoring.initial,
          },
          {
            systemId: system.system.id,
            poseLabel:
              mode === "locked"
                ? "prepared co-crystal input pose"
                : "current pose",
            score: scoring.autoGrid,
          },
        ),
        state: "ready",
      };
    } catch {
      return { result: null, state: "invalid" };
    }
  }, [mode, scoring, system]);

  const ligandAtomColors = useMemo(
    () =>
      atomLensEnabled && atomLens.result
        ? atomLens.result.contributions.map(
            (contribution) => contribution.style.hex,
          )
        : undefined,
    [atomLens.result, atomLensEnabled],
  );

  const ligandAtomHighlights = useMemo<readonly LigandAtomHighlight[] | undefined>(
    () =>
      atomLensEnabled &&
      atomLens.result &&
      (atomLens.result.topContributors[0]?.absoluteTotalDelta ?? 0) >= 0.005
        ? atomLens.result.topContributors.map((contribution) => ({
            index: contribution.atomIndex,
            color: contribution.style.hex,
          }))
        : undefined,
    [atomLens.result, atomLensEnabled],
  );

  const interactions = useMemo<MolecularInteraction[]>(() => {
    if (!bundle || !scoring) return [];
    const hydrogenBonds = [...scoring.geometry.hydrogenBonds]
      .sort((left, right) => left.energy - right.energy)
      .slice(0, 4)
      .flatMap(
      (interaction, index) => {
        const ligandAtomIndex = bundle.ligandIndex.get(interaction.ligandAtomId);
        const receptorAtomIndex = bundle.receptorIndex.get(interaction.receptorAtomId);
        if (ligandAtomIndex === undefined || receptorAtomIndex === undefined) return [];
        return [{
          id: `hbond-${interaction.receptorAtomId}-${interaction.ligandAtomId}-${index}`,
          kind: "hydrogen-bond" as const,
          ligandAtomIndex,
          receptorAtomIndex,
          strength: Math.abs(interaction.energy),
          distance: interaction.distance,
        }];
      },
    );
    const clashes = scoring.geometry.clashes.pairs.flatMap((interaction, index) => {
      const ligandAtomIndex = bundle.ligandIndex.get(interaction.ligandAtomId);
      const receptorAtomIndex = bundle.receptorIndex.get(interaction.receptorAtomId);
      if (ligandAtomIndex === undefined || receptorAtomIndex === undefined) return [];
      return [{
        id: `clash-${interaction.receptorAtomId}-${interaction.ligandAtomId}-${index}`,
        kind: "clash" as const,
        ligandAtomIndex,
        receptorAtomIndex,
        strength: interaction.severity,
        distance: interaction.distance,
      }];
    });
    return [...hydrogenBonds, ...clashes];
  }, [bundle, scoring]);

  const contactReadout = useMemo<ContactReadout[]>(() => {
    if (!bundle || !scoring) return [];
    const seen = new Set<string>();
    const contacts: ContactReadout[] = [];

    for (const interaction of [...scoring.geometry.hydrogenBonds].sort(
      (left, right) => left.energy - right.energy,
    )) {
      const receptorAtomIndex = bundle.receptorIndex.get(
        interaction.receptorAtomId,
      );
      if (receptorAtomIndex === undefined) continue;
      const atom = bundle.receptor[receptorAtomIndex];
      const residue = `${atom.residueName ?? "RES"}${atom.residueNumber ?? "?"}${
        atom.chain ? ` ${atom.chain}` : ""
      }`;
      if (seen.has(residue)) continue;
      seen.add(residue);
      contacts.push({
        id: `${interaction.receptorAtomId}-${interaction.ligandAtomId}`,
        residue,
        distance: interaction.distance,
      });
      if (contacts.length === 3) break;
    }

    return contacts;
  }, [bundle, scoring]);

  const stageScore = useMemo<StageScore | null>(
    () => scoring ? {
      total: scoring.visible.total,
      normalized: scoring.visible.normalized,
      terms: scoring.visible.terms,
    } : null,
    [scoring],
  );

  const recordPoseScore = useCallback(
    (next: MolecularPose) => {
      if (!bundle || !grid) return;
      const scoredPose = scorePoseWithAutoGrid(
        grid,
        bundle.ligand,
        toLigandPose(next, bundle.ligandCentroid),
      );
      if (scoredPose.outsideGridAtoms > 0) return;
      const total = scoredPose.total;
      setScoreTrace((current) => {
        const previous = current.at(-1);
        if (previous !== undefined && Math.abs(previous - total) < 0.025) {
          return current;
        }
        return [...current.slice(-31), total];
      });
    },
    [bundle, grid],
  );

  const ensureAudio = useCallback(() => {
    if (muted || typeof window === "undefined") return null;
    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextConstructor) return null;
    const context = audioContext.current ?? new AudioContextConstructor();
    audioContext.current = context;
    if (context.state === "suspended") void context.resume();
    return context;
  }, [muted]);

  const playLock = useCallback(() => {
    const context = ensureAudio();
    if (!context) return;
    const now = context.currentTime;
    const gain = context.createGain();
    const tone = context.createOscillator();
    const shimmer = context.createOscillator();
    tone.type = "sine";
    shimmer.type = "triangle";
    tone.frequency.setValueAtTime(220, now);
    tone.frequency.exponentialRampToValueAtTime(440, now + 0.22);
    shimmer.frequency.setValueAtTime(660, now + 0.06);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    tone.connect(gain);
    shimmer.connect(gain);
    gain.connect(context.destination);
    tone.start(now);
    shimmer.start(now + 0.06);
    tone.stop(now + 0.44);
    shimmer.stop(now + 0.32);
  }, [ensureAudio]);

  useEffect(() => {
    const quality = scoring?.visible.normalized ?? 0;
    if (quality < 0.72) lockArmed.current = true;
    if (mode === "explore" && quality > 0.94 && lockArmed.current) {
      lockArmed.current = false;
      playLock();
    }
  }, [mode, playLock, scoring?.visible.normalized]);

  const handlePoseChange = useCallback(
    (next: MolecularPose) => {
      if (mode === "revealing" || mode === "locked") return;
      setPose(next);
      recordPoseScore(next);
      setHasMoved(true);
      if (mode !== "explore") setMode("explore");
    },
    [mode, recordPoseScore],
  );

  const startFitting = useCallback(() => {
    ensureAudio();
    setMode("explore");
    focusMolecularStage();
  }, [ensureAudio]);

  const resetAttempt = useCallback(() => {
    if (!bundle) return;
    if (revealFrame.current !== null) cancelAnimationFrame(revealFrame.current);
    revealFrame.current = null;
    lockArmed.current = true;
    setHasMoved(false);
    setScoreTrace([]);
    setPose(bundle.initialPose);
    setMode("explore");
    focusMolecularStage();
  }, [bundle]);

  const revealExperimentalPose = useCallback(() => {
    if (!bundle || mode === "revealing") return;
    if (mode === "locked") {
      resetAttempt();
      return;
    }
    ensureAudio();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPose(bundle.crystalPose);
      recordPoseScore(bundle.crystalPose);
      setMode("locked");
      playLock();
      return;
    }
    const from = pose;
    const started = performance.now();
    const duration = 1150;
    setMode("revealing");

    const step = (time: number) => {
      const linear = clamp01((time - started) / duration);
      const eased = 1 - (1 - linear) ** 3;
      const next = interpolatePose(from, bundle.crystalPose, eased);
      setPose(next);
      recordPoseScore(next);
      if (linear < 1) {
        revealFrame.current = requestAnimationFrame(step);
      } else {
        revealFrame.current = null;
        setPose(bundle.crystalPose);
        setMode("locked");
        playLock();
      }
    };
    revealFrame.current = requestAnimationFrame(step);
  }, [bundle, ensureAudio, mode, playLock, pose, recordPoseScore, resetAttempt]);

  const systemLabel = system
    ? `RCSB PDB ${system.system.entryId.toUpperCase()}`
    : `RCSB PDB ${activeTarget.entryId}`;
  const atomCount =
    (system?.receptor.atoms.length ?? 0) + (system?.ligand.atoms.length ?? 0);
  const visibleScore = scoring?.visible ?? null;
  const challengeScore =
    system?.validation?.gridChecks?.rotated15DegreesScore ??
    scoring?.initial.total ??
    0;
  const translationScore =
    system?.validation?.gridChecks?.[activeTarget.translation.scoreKey];
  const statusReadout = readoutFor(visibleScore, mode, activeTarget);
  const learningPoseState: LearningChallengePoseState =
    mode === "revealing"
      ? "revealing"
      : mode === "locked"
        ? "reference"
        : mode === "explore"
          ? hasMoved
            ? "free"
            : "challenge"
          : "unavailable";

  return (
    <main className={`snap-shell mode-${mode}`}>
      <header className="snap-header">
        <a className="snap-wordmark" href="#instrument" aria-label="Snap home">
          SNAP
          <span>The small molecule binding instrument</span>
        </a>
        <div className="structure-id">
          <span className="live-dot" aria-hidden="true" />
          <div>
            <strong>{systemLabel}</strong>
            <span>
              {system
                ? system.system.name
                : "public experimental coordinates"}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <span className="local-mark">
            <Check size={13} /> score runs in this browser
          </span>
          <button
            className="icon-action"
            type="button"
            onClick={() => setMuted((value) => !value)}
            aria-label={muted ? "Turn sound on" : "Mute sound"}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
        </div>
      </header>

      <nav className="benchmark-bar" aria-label="Prepared molecular benchmarks">
        <div className="benchmark-label">
          <span>Prepared benchmark</span>
          <strong>2 systems · 2 target-specific fields</strong>
        </div>
        <div className="benchmark-tabs" role="group" aria-label="Choose a prepared target">
          {TARGET_ORDER.map((targetId) => {
            const target = TARGETS[targetId];
            const selected = targetId === selectedTarget;
            return (
              <button
                className={selected ? "is-active" : undefined}
                type="button"
                data-target-id={targetId}
                aria-pressed={selected}
                onClick={() => handleTargetSelect(targetId)}
                key={targetId}
              >
                <span>{target.entryId}</span>
                <span>
                  <strong>{target.selectorLabel}</strong>
                  <small>{target.selectorDetail}</small>
                </span>
              </button>
            );
          })}
        </div>
        <p className="benchmark-disclosure" aria-live="polite">
          <strong>{activeTarget.disclosure}</strong>
          <span>
            Static assets load on selection; scoring then stays local. Compare
            poses within one target, never binding strength between targets.
          </span>
        </p>
      </nav>

      <section className="instrument" id="instrument">
        <div className="instrument-stage">
          <div className="stage-vignette" />
          <div className="stage-coordinate stage-coordinate-x">X</div>
          <div className="stage-coordinate stage-coordinate-y">Y</div>
          <div className="stage-coordinate stage-coordinate-z">Z</div>

          {mode === "loading" && <LoadingSpecimen label={activeTarget.loadingLabel} />}

          {mode === "error" && (
            <div className="error-state" role="alert">
              <CircleAlert size={24} />
              <strong>The prepared structure could not load.</strong>
              <p>{error}</p>
              <span>No score is shown until the verified structure loads.</span>
            </div>
          )}

          {bundle && grid && (
            <div className="molecular-mount">
              <MolecularStage
                key={system?.system.id}
                system={bundle.stageSystem}
                pose={pose}
                score={stageScore}
                interactions={interactions}
                ligandAtomColors={ligandAtomColors}
                ligandAtomHighlights={ligandAtomHighlights}
                onPoseChange={handlePoseChange}
                crystalPose={bundle.crystalPose}
                showCrystalGhost={mode === "revealing"}
                disabled={mode === "intro" || mode === "revealing" || mode === "locked"}
                ariaLabel={activeTarget.stageAriaLabel}
              />
            </div>
          )}

          <AnimatePresence>
            {mode === "intro" && system && (
              <motion.div
                className="intro-card"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
              >
                <span className="intro-kicker">{activeTarget.introKicker}</span>
                <h1>{activeTarget.introTitle}</h1>
                <p>{activeTarget.introBody}</p>
                <button className="hero-action" type="button" onClick={startFitting}>
                  <Grab size={18} />
                  Start fitting
                </button>
                <small>{activeTarget.introBoundary}</small>
              </motion.div>
            )}
          </AnimatePresence>

          {mode === "locked" && (
            <motion.div
              className="pose-seal"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Check size={15} /> Prepared co-crystal input pose
            </motion.div>
          )}

          {mode === "explore" && !hasMoved && (
            <motion.div
              className="pose-seal pose-seal--challenge"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <RotateCcw size={15} /> 15° challenge pose
            </motion.div>
          )}

          {atomLensEnabled && atomLens.result && (
            <div className="atom-lens-stage-key" aria-hidden="true">
              {CONTRIBUTION_TONE_ORDER.map((tone) => {
                const style = CONTRIBUTION_TONE_STYLES[tone];
                return (
                  <span
                    key={tone}
                    style={{ "--legend-color": style.hex } as CSSProperties}
                  >
                    <i /> {style.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <aside className="story-rail" aria-label="Interaction guide">
          <div className="story-index">01 / FIT</div>
          <div className="story-copy">
            <span className="eyebrow"><FlaskConical size={14} /> Watch the fit change</span>
            <h2>Move it.<br />See what changes.</h2>
            <p>
              A lower score is better. Steric overlaps flash red. Plausible
              hydrogen bond contacts appear in cyan. Every score component is exposed.
            </p>
          </div>
          <div className="integrity-note" aria-live="polite">
            <span>Live readout</span>
            <strong>{statusReadout}</strong>
            {contactReadout.length > 0 && (
              <div
                className="contact-readout"
                aria-label="Closest plausible hydrogen bond contacts"
              >
                <span>Candidate contacts</span>
                {contactReadout.map((contact) => (
                  <div key={contact.id}>
                    <b>{contact.residue}</b>
                    <em>{contact.distance.toFixed(2)} Å</em>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            className="reveal-action"
            type="button"
            disabled={mode === "loading" || mode === "intro" || mode === "error" || mode === "revealing"}
            onClick={revealExperimentalPose}
          >
            {mode === "locked" ? <RotateCcw size={17} /> : <Eye size={17} />}
            {mode === "locked" ? "Try another pose" : mode === "revealing" ? "Revealing…" : "Reveal prepared pose"}
          </button>
        </aside>

        <aside className="score-rail" aria-label="Live score">
          <ScoreDial score={visibleScore} />
          <div className="interaction-counts">
            <div><strong>{visibleScore?.hydrogenBonds ?? "—"}</strong><span>H bond candidates</span></div>
            <div><strong>{visibleScore?.clashes ?? "—"}</strong><span>clashes</span></div>
            <div><strong>{visibleScore?.evaluatedPairs.toLocaleString() ?? "—"}</strong><span>pairs checked</span></div>
          </div>
          <AtomContributionLens
            enabled={atomLensEnabled}
            onToggle={() => setAtomLensEnabled((current) => !current)}
            lens={atomLens.result}
            state={atomLens.state}
            ligandAtoms={bundle?.ligand ?? []}
            fallback={
              <ScoreTrace
                values={
                  scoreTrace.length > 0
                    ? scoreTrace
                    : visibleScore && visibleScore.outsideGridAtoms === 0
                      ? [visibleScore.total]
                      : []
                }
                baseline={challengeScore}
                outsideGrid={(visibleScore?.outsideGridAtoms ?? 0) > 0}
              />
            }
          />
          <div className="model-boundary">
            <Sparkles size={14} />
            <p>
              {activeTarget.modelBoundary}
            </p>
          </div>
        </aside>
      </section>

      <footer className="instrument-footer">
        <div className="specimen-facts">
          <span>{atomCount ? `${atomCount.toLocaleString()} displayed atoms` : "waiting for prepared atoms"}</span>
          <span>{system?.frame.coordinateUnits ?? "ångström coordinates"}</span>
          <span>{system?.system.resolutionAngstrom ? `${system.system.resolutionAngstrom.toFixed(2)} Å resolution` : "experimental structure"}</span>
        </div>
        <TermLedger score={visibleScore} />
        <div className="build-credit">Built with GPT-5.6 in Codex · scoring runs in this browser</div>
      </footer>

      <LearningChallenge
        key={selectedTarget}
        contextLabel={activeTarget.learningContextLabel}
        currentScore={visibleScore?.total ?? null}
        contacts={contactReadout}
        candidateContactCount={visibleScore?.hydrogenBonds ?? null}
        clashes={visibleScore?.clashes ?? null}
        poseState={learningPoseState}
        isReadoutValid={(visibleScore?.outsideGridAtoms ?? 1) === 0}
        onResetChallengePose={resetAttempt}
        onRevealReferencePose={revealExperimentalPose}
        onComplete={handleLearningComplete}
      />

      <TwoTargetObservationRecord
        observations={targetObservations}
        activeTarget={selectedTarget}
        contactTransferState={contactTransferState}
        onLockContactPrediction={handleLockContactPrediction}
        onSelectTarget={handleObservationTargetSelect}
      />

      <section className="proof-section" aria-labelledby="proof-title">
        <div className="proof-heading">
          <span className="proof-index">03 / PROOF</span>
          <h2 id="proof-title">The heavy-atom pose came from experiment. The score did not.</h2>
          <p>
            Heavy-atom reference coordinates come from public PDB data; modeled
            polar hydrogens, atom types, and charges come from pinned prepared
            inputs. SNAP independently resamples each target-specific field.
          </p>
        </div>
        <div className="control-panel" aria-label="Defined pose controls">
          <article className="control-card control-card-reference">
            <span>Prepared co-crystal input</span>
            <strong>{formatTerm(system?.validation?.gridChecks?.referenceCrystalPoseScore)}</strong>
            <p>{activeTarget.proofReference}</p>
          </article>
          <article className="control-card">
            <span>{activeTarget.translation.label}</span>
            <strong>{formatTerm(translationScore)}</strong>
            <p>{activeTarget.translation.description}</p>
          </article>
          <article className="control-card">
            <span>Rotate 15°</span>
            <strong>{formatTerm(system?.validation?.gridChecks?.rotated15DegreesScore)}</strong>
            <p>{activeTarget.rotationDescription}</p>
          </article>
        </div>
        <div className="engine-proof">
          <div>
            <span>What runs on every move</span>
            <code>atom-type map + q × electrostatics + |q| × desolvation</code>
          </div>
          <p>
            {activeTarget.geometryBoundary} Each target is a rigid prepared
            pose and its own interaction field. SNAP does not search for drugs
            or predict affinity. Scores are target-specific: never compare the
            1STP and 3CE3 numbers as binding strength.
          </p>
        </div>
      </section>
    </main>
  );
}
