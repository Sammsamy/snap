"use client";

import {
  Check,
  CircleAlert,
  Eye,
  FlaskConical,
  Grab,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MolecularStage,
  type MolecularInteraction,
  type MolecularPose,
  type MolecularSystem,
  type ScoreBreakdown as StageScore,
} from "./MolecularStage";
import {
  scorePose,
  scorePoseWithAutoGrid,
  type AutoGridMapSet,
  type LigandPose,
  type MolecularAtom as ScoringAtom,
} from "../lib/scoring";
import "./snap-experience.css";

type Vec3 = [number, number, number];
type QuaternionTuple = [number, number, number, number];

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
  receptor: { atoms: StructureAtom[]; bonds?: StructureBond[] };
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

function buildModelBundle(system: PreparedSystem): ModelBundle {
  const ligandCentroid = system.frame.referenceLigandCentroid;
  const pocketCutoff =
    system.pocket?.cutoffAngstrom ??
    system.pocket?.residueCutoffAngstrom ??
    5;
  const pocketCutoffSquared = pocketCutoff * pocketCutoff;
  const ligandReference = system.ligand.atoms.map(atomPosition);
  const receptor = system.receptor.atoms.map(makeScoringAtom);
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

async function hydrateAutoGrid(document: AutoGridDocument): Promise<AutoGridMapSet> {
  const prepared = document.autoGrid;
  const count =
    prepared.dimensions.x * prepared.dimensions.y * prepared.dimensions.z;
  let channels: Record<string, Float32Array> = {};

  if (prepared.binary) {
    try {
      const response = await fetch(prepared.binary.url);
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
  const chartMinimum = -10;
  const chartMaximum = 8;
  const points = values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
      const clamped = Math.min(chartMaximum, Math.max(chartMinimum, value));
      const y = 34 - ((clamped - chartMinimum) / (chartMaximum - chartMinimum)) * 32;
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

  return (
    <div
      className="score-trace"
      aria-label={
        outsideGrid
          ? "Pose trace paused because part of the molecule is outside the prepared grid."
          : current === undefined
          ? "No recent pose scores"
          : `Recent local pose scores. Current ${current.toFixed(2)}, ${comparison} than the 15 degree challenge pose.`
      }
    >
      <div>
        <span>Live pose trace</span>
        <strong>{comparison}</strong>
      </div>
      <svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="16.22" x2="100" y2="16.22" />
        {points && <polyline points={points} />}
      </svg>
    </div>
  );
}

function LoadingSpecimen() {
  return (
    <div className="loading-specimen" role="status">
      <div className="loading-orbit">
        <i />
        <i />
        <i />
      </div>
      <span>Loading PDB 1STP and its prepared AutoGrid field</span>
    </div>
  );
}

function readoutFor(score: VisibleScore | null, mode: ExperienceMode): string {
  if (!score) return "The numerical readout appears after the structure and grid load.";
  if (mode === "locked") {
    return "This is the prepared PDB co-crystal pose. The scoring field ranks it above our defined decoys.";
  }
  if (score.outsideGridAtoms > 0) {
    return "Part of biotin has left the prepared grid. Move it back toward the pocket.";
  }
  if (score.clashes > 0) {
    return "Red markers show atoms pushed too close together. Move or rotate biotin to clear the overlap.";
  }
  if (score.normalized > 0.82) {
    return "The local field now favors this pose. Reveal the PDB coordinates to compare it with experiment.";
  }
  if (score.hydrogenBonds > 0) {
    return "Cyan lines mark plausible hydrogen bond geometry. Keep them while lowering the local score.";
  }
  return "Move biotin through the pocket. Lower the score and watch for contact geometry without forcing atoms together.";
}

export function SnapExperience() {
  const [mode, setMode] = useState<ExperienceMode>("loading");
  const [system, setSystem] = useState<PreparedSystem | null>(null);
  const [grid, setGrid] = useState<AutoGridMapSet | null>(null);
  const [pose, setPose] = useState<MolecularPose>({
    position: [0, 0, 0],
    rotation: START_ROTATION,
  });
  const [muted, setMuted] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const [scoreTrace, setScoreTrace] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const revealFrame = useRef<number | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const lockArmed = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSystem() {
      try {
        const response = await fetch("/data/1stp-biotin.json");
        if (!response.ok) throw new Error(`Structure asset returned ${response.status}.`);
        const prepared = (await response.json()) as PreparedSystem;
        if (!prepared.receptor?.atoms?.length || !prepared.ligand?.atoms?.length) {
          throw new Error("The prepared structure is missing receptor or ligand atoms.");
        }
        if (!prepared.scoring?.autoGridManifest) {
          throw new Error("The prepared structure does not name its AutoGrid manifest.");
        }
        const gridResponse = await fetch(prepared.scoring.autoGridManifest);
        if (!gridResponse.ok) {
          throw new Error(`AutoGrid manifest returned ${gridResponse.status}.`);
        }
        const gridDocument = (await gridResponse.json()) as AutoGridDocument;
        const preparedGrid = await hydrateAutoGrid(gridDocument);
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
          setMode("intro");
        }
      } catch (reason) {
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
      if (revealFrame.current !== null) cancelAnimationFrame(revealFrame.current);
    };
  }, []);

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
    const span = Math.max(0.1, initial.total - crystal.total);
    const normalized = clamp01((initial.total - autoGrid.total) / span);

    const visible: VisibleScore = {
      total: autoGrid.total,
      normalized,
      terms: autoGrid.terms,
      clashes: geometry.clashes.count,
      hydrogenBonds: geometry.hydrogenBonds.length,
      evaluatedPairs: geometry.evaluatedPairs,
      outsideGridAtoms: autoGrid.outsideGridAtoms,
    };
    return { autoGrid, geometry, visible };
  }, [bundle, grid, pose]);

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
    : "RCSB PDB 1STP";
  const atomCount =
    (system?.receptor.atoms.length ?? 0) + (system?.ligand.atoms.length ?? 0);
  const visibleScore = scoring?.visible ?? null;
  const challengeScore =
    system?.validation?.gridChecks?.rotated15DegreesScore ?? 4.370703;
  const statusReadout = readoutFor(visibleScore, mode);

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
                ? `${system.system.name} / ${system.system.ligand.name}`
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

      <section className="instrument" id="instrument">
        <div className="instrument-stage">
          <div className="stage-vignette" />
          <div className="stage-coordinate stage-coordinate-x">X</div>
          <div className="stage-coordinate stage-coordinate-y">Y</div>
          <div className="stage-coordinate stage-coordinate-z">Z</div>

          {mode === "loading" && <LoadingSpecimen />}

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
                system={bundle.stageSystem}
                pose={pose}
                score={stageScore}
                interactions={interactions}
                onPoseChange={handlePoseChange}
                crystalPose={bundle.crystalPose}
                showCrystalGhost={mode === "revealing"}
                disabled={mode === "intro" || mode === "revealing" || mode === "locked"}
                ariaLabel="Fit biotin into the prepared streptavidin chain A pocket"
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
                <span className="intro-kicker">A real molecule. A prepared scoring field.</span>
                <h1>Fit biotin into the pocket.</h1>
                <p>
                  Grab biotin and move it through the prepared 1STP pocket. The
                  local score and contact markers update with every move.
                </p>
                <button className="hero-action" type="button" onClick={startFitting}>
                  <Grab size={18} />
                  Start fitting
                </button>
                <small>Real PDB coordinates · rigid molecules · simplified score</small>
              </motion.div>
            )}
          </AnimatePresence>

          {mode === "locked" && (
            <motion.div
              className="pose-seal"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Check size={15} /> Prepared PDB co-crystal pose
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
            {mode === "locked" ? "Try another pose" : mode === "revealing" ? "Revealing…" : "Reveal the PDB pose"}
          </button>
        </aside>

        <aside className="score-rail" aria-label="Live score">
          <ScoreDial score={visibleScore} />
          <div className="interaction-counts">
            <div><strong>{visibleScore?.hydrogenBonds ?? "—"}</strong><span>H bond candidates</span></div>
            <div><strong>{visibleScore?.clashes ?? "—"}</strong><span>clashes</span></div>
            <div><strong>{visibleScore?.evaluatedPairs.toLocaleString() ?? "—"}</strong><span>pairs checked</span></div>
          </div>
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
          <div className="model-boundary">
            <Sparkles size={14} />
            <p>
              Rigid single-chain model. No flexibility or pose search. Built
              for intuition, not drug discovery predictions.
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

      <section className="proof-section" aria-labelledby="proof-title">
        <div className="proof-heading">
          <span className="proof-index">02 / PROOF</span>
          <h2 id="proof-title">The pose came from experiment. The score did not.</h2>
          <p>
            The reference coordinates are public PDB data. SNAP independently
            resamples the prepared interaction field, so a judge can move the
            molecule, break the fit, and watch the result change.
          </p>
        </div>
        <div className="control-panel" aria-label="Defined pose controls">
          <article className="control-card control-card-reference">
            <span>Prepared PDB pose</span>
            <strong>{formatTerm(system?.validation?.gridChecks?.referenceCrystalPoseScore)}</strong>
            <p>Reference coordinates from 1STP</p>
          </article>
          <article className="control-card">
            <span>Move 0.5 Å</span>
            <strong>{formatTerm(system?.validation?.gridChecks?.translated0_5AngstromScore)}</strong>
            <p>A half ångström displacement weakens the local score</p>
          </article>
          <article className="control-card">
            <span>Rotate 15°</span>
            <strong>{formatTerm(system?.validation?.gridChecks?.rotated15DegreesScore)}</strong>
            <p>A small rotation creates an unfavorable contact field</p>
          </article>
        </div>
        <div className="engine-proof">
          <div>
            <span>What runs on every move</span>
            <code>atom-type map + q × electrostatics + |q| × desolvation</code>
          </div>
          <p>
            This is one rigid, prepared, single-chain model. It teaches why a
            pose changes. It does not search for drugs or predict affinity.
          </p>
        </div>
      </section>
    </main>
  );
}
