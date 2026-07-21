import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  IDENTITY_POSE,
  parseAutoGridMap,
  quaternionFromAxisAngle,
  scorePoseWithAutoGrid,
  type AutoGridMapSet,
  type LigandPose,
  type MolecularAtom,
  type ParsedAutoGridMap,
  type Vec3,
} from "../../../app/lib/scoring";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.dirname(here);
const raw = path.join(sourceRoot, "raw");
const channels = ["A", "C", "F", "OA", "N", "HD", "e", "d"] as const;
const affinityChannels = channels.slice(0, -2);
const maximumDirectoryBytes = 3_500_000;

interface RuntimeAtom {
  id: number;
  element: string;
  name?: string;
  residueName: string;
  residueNumber: number;
  chainId?: string;
  position: [number, number, number];
  partialCharge: number;
  autodockType: string;
}

interface RuntimeSystem {
  frame: { referenceLigandCentroid: [number, number, number] };
  receptor: { chainId: string; atoms: RuntimeAtom[] };
  ligand: {
    atoms: RuntimeAtom[];
    bonds: Array<{ a: number; b: number; order: number }>;
    referencePose: { positions: Array<[number, number, number]> };
  };
  scoring: { referencePoseScore: number };
}

interface RuntimeGridDocument {
  autoGrid: {
    spacing: number;
    dimensions: { x: number; y: number; z: number };
    center: [number, number, number];
    origin: [number, number, number];
    channelOrder: string[];
    binary: {
      dtype: string;
      endianness: string;
      layout: string;
      channelOrder: string[];
      valuesPerChannel: number;
      bytesPerChannel: number;
      byteOffsets: Record<string, number>;
      byteLength: number;
      sha256: string;
    };
  };
}

function read(relativePath: string): Buffer {
  return fs.readFileSync(path.join(here, relativePath));
}

function json<T>(relativePath: string): T {
  return JSON.parse(read(relativePath).toString("utf8")) as T;
}

function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function elementForType(type: string): string {
  if (type === "HD" || type === "HS") return "H";
  if (type === "OA" || type === "OS") return "O";
  if (type === "NA" || type === "NS" || type === "N") return "N";
  if (type === "SA" || type === "S") return "S";
  if (type === "A" || type === "C") return "C";
  return type.replace(/[^A-Za-z]/g, "") || "C";
}

function parsePdbqt(filePath: string): RuntimeAtom[] {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("ATOM") || line.startsWith("HETATM"))
    .map((line) => {
      const fields = line.trim().split(/\s+/);
      const autodockType = fields.at(-1) ?? "C";
      const partialCharge = Number(fields.at(-2));
      const position = [
        Number(line.slice(30, 38)),
        Number(line.slice(38, 46)),
        Number(line.slice(46, 54)),
      ] as [number, number, number];
      assert.ok(position.every(Number.isFinite), `invalid coordinates: ${line}`);
      assert.ok(Number.isFinite(partialCharge), `invalid charge: ${line}`);
      return {
        id: Number(line.slice(6, 11)),
        element: elementForType(autodockType),
        name: line.slice(12, 16).trim(),
        residueName: line.slice(17, 20).trim(),
        residueNumber: Number(line.slice(22, 26)),
        chainId: line.slice(21, 22).trim(),
        position,
        partialCharge,
        autodockType,
      };
    });
}

function molecularAtom(atom: RuntimeAtom): MolecularAtom {
  const type = atom.autodockType.toUpperCase();
  return {
    id: String(atom.id),
    name: atom.name,
    residueName: atom.residueName,
    residueNumber: atom.residueNumber,
    chain: atom.chainId,
    position: { x: atom.position[0], y: atom.position[1], z: atom.position[2] },
    element: atom.element,
    autodockType: atom.autodockType,
    partialCharge: atom.partialCharge,
    donor: type === "HD" || type === "HS",
    acceptor: ["OA", "OS", "NA", "NS", "SA"].includes(type),
  };
}

function centroid(atoms: readonly RuntimeAtom[]): Vec3 {
  return atoms.reduce(
    (sum, atom) => ({
      x: sum.x + atom.position[0] / atoms.length,
      y: sum.y + atom.position[1] / atoms.length,
      z: sum.z + atom.position[2] / atoms.length,
    }),
    { x: 0, y: 0, z: 0 },
  );
}

function assertAtomEqual(actual: RuntimeAtom, source: RuntimeAtom, role: string): void {
  assert.equal(actual.id, source.id, `${role} id`);
  assert.equal(actual.element, source.element, `${role} element`);
  assert.equal(actual.residueName, source.residueName, `${role} residueName`);
  assert.equal(actual.residueNumber, source.residueNumber, `${role} residueNumber`);
  assert.deepEqual(actual.position, source.position, `${role} position`);
  assert.equal(actual.partialCharge, source.partialCharge, `${role} partialCharge`);
  assert.equal(actual.autodockType, source.autodockType, `${role} autodockType`);
}

const bundle = json<{
  maximumDirectoryBytes: number;
  artifacts: Array<{ path: string; bytes: number; sha256: string }>;
}>("bundle-manifest.json");
assert.equal(bundle.maximumDirectoryBytes, maximumDirectoryBytes);
for (const artifact of bundle.artifacts) {
  const bytes = read(artifact.path);
  assert.equal(bytes.byteLength, artifact.bytes, `${artifact.path} byte count`);
  assert.equal(sha256(bytes), artifact.sha256, `${artifact.path} SHA-256`);
}
const directoryBytes = fs
  .readdirSync(here, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .reduce((sum, entry) => sum + fs.statSync(path.join(here, entry.name)).size, 0);
assert.ok(
  directoryBytes <= maximumDirectoryBytes,
  `runtime directory ${directoryBytes} exceeds ${maximumDirectoryBytes} bytes`,
);

const gridDocument = json<RuntimeGridDocument>("3ce3-autogrid-runtime.json");
const gridMetadata = gridDocument.autoGrid;
assert.deepEqual(gridMetadata.channelOrder, channels);
assert.deepEqual(gridMetadata.binary.channelOrder, channels);
assert.equal(gridMetadata.binary.dtype, "float32");
assert.equal(gridMetadata.binary.endianness, "little");
assert.equal(gridMetadata.binary.layout, "channel-major");
const gridBinary = read("3ce3-autogrid.f32");
assert.equal(gridBinary.byteLength, gridMetadata.binary.byteLength);
assert.equal(sha256(gridBinary), gridMetadata.binary.sha256);

const sourceMaps = Object.fromEntries(
  channels.map((channel) => {
    const text = fs.readFileSync(path.join(raw, `3ce3_protein.${channel}.map`), "utf8");
    return [channel, parseAutoGridMap(channel, text)];
  }),
) as Record<(typeof channels)[number], ParsedAutoGridMap>;

const binaryMaps: Record<string, Float32Array> = {};
let comparedGridValues = 0;
for (const channel of channels) {
  const source = sourceMaps[channel];
  assert.equal(gridMetadata.binary.valuesPerChannel, source.values.length);
  assert.deepEqual(gridMetadata.dimensions, source.dimensions);
  assert.equal(gridMetadata.spacing, source.spacing);
  assert.deepEqual(gridMetadata.center, [source.center.x, source.center.y, source.center.z]);
  assert.deepEqual(gridMetadata.origin, [source.origin.x, source.origin.y, source.origin.z]);
  const offset = gridMetadata.binary.byteOffsets[channel];
  assert.equal(offset, channels.indexOf(channel) * gridMetadata.binary.bytesPerChannel);
  const values = new Float32Array(
    gridBinary.buffer.slice(
      gridBinary.byteOffset + offset,
      gridBinary.byteOffset + offset + gridMetadata.binary.bytesPerChannel,
    ),
  );
  assert.equal(values.length, source.values.length);
  for (let index = 0; index < values.length; index += 1) {
    assert.equal(values[index], source.values[index], `${channel}[${index}]`);
  }
  comparedGridValues += values.length;
  binaryMaps[channel] = values;
}
assert.equal(comparedGridValues, 739_640);

const grid: AutoGridMapSet = {
  spacing: gridMetadata.spacing,
  dimensions: gridMetadata.dimensions,
  center: {
    x: gridMetadata.center[0],
    y: gridMetadata.center[1],
    z: gridMetadata.center[2],
  },
  origin: {
    x: gridMetadata.origin[0],
    y: gridMetadata.origin[1],
    z: gridMetadata.origin[2],
  },
  affinityMaps: Object.fromEntries(
    affinityChannels.map((channel) => [channel, binaryMaps[channel]]),
  ),
  electrostaticsMap: binaryMaps.e,
  desolvationMap: binaryMaps.d,
};

const system = json<RuntimeSystem>("3ce3-system.json");
const receptorSource = parsePdbqt(path.join(raw, "3ce3_protein.pdbqt"));
const ligandSource = parsePdbqt(path.join(raw, "3ce3_ligand.pdbqt"));
assert.equal(system.receptor.chainId, "A");
assert.equal(system.receptor.atoms.length, receptorSource.length);
assert.equal(system.ligand.atoms.length, ligandSource.length);
system.receptor.atoms.forEach((atom, index) =>
  assertAtomEqual(atom, receptorSource[index], `receptor[${index}]`),
);
system.ligand.atoms.forEach((atom, index) => {
  assertAtomEqual(atom, ligandSource[index], `ligand[${index}]`);
  assert.equal(atom.name, ligandSource[index].name, `ligand[${index}] name`);
  assert.equal(atom.chainId, ligandSource[index].chainId, `ligand[${index}] chain`);
  assert.deepEqual(
    system.ligand.referencePose.positions[index],
    ligandSource[index].position,
    `referencePose[${index}]`,
  );
});
const expectedCentroid = centroid(ligandSource);
assert.deepEqual(system.frame.referenceLigandCentroid, [
  expectedCentroid.x,
  expectedCentroid.y,
  expectedCentroid.z,
]);
const ligandIds = new Set(system.ligand.atoms.map((atom) => atom.id));
assert.ok(system.ligand.bonds.length > 0, "display bond topology must not be empty");
for (const bond of system.ligand.bonds) {
  assert.ok(ligandIds.has(bond.a), `unknown ligand bond atom ${bond.a}`);
  assert.ok(ligandIds.has(bond.b), `unknown ligand bond atom ${bond.b}`);
  assert.equal(bond.order, 1, "display-only bonds are intentionally single-order");
}
const ligandTypes = [...new Set(ligandSource.map((atom) => atom.autodockType))].sort();
assert.deepEqual(
  ligandTypes,
  [...affinityChannels].filter((channel) => ligandTypes.includes(channel)).sort(),
  "every ligand atom type must have an affinity map",
);

const ligand = ligandSource.map(molecularAtom);
const poses: Record<string, LigandPose> = {
  reference: IDENTITY_POSE,
  translated_x_minus_1: {
    ...IDENTITY_POSE,
    translation: { x: -1, y: 0, z: 0 },
  },
  translated_z_plus_1: {
    ...IDENTITY_POSE,
    translation: { x: 0, y: 0, z: 1 },
  },
  rotated_z_15deg: {
    translation: { x: 0, y: 0, z: 0 },
    rotation: quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 12),
    pivot: expectedCentroid,
  },
};
const expectedScores = JSON.parse(
  fs.readFileSync(path.join(sourceRoot, "scores.json"), "utf8"),
) as { poses: Record<string, { total: number; terms: Record<string, number> }> };
const scored = Object.fromEntries(
  Object.entries(poses).map(([id, pose]) => [id, scorePoseWithAutoGrid(grid, ligand, pose)]),
);
for (const [id, score] of Object.entries(scored)) {
  assert.equal(score.outsideGridAtoms, 0, `${id} must stay in a complete interpolation cell`);
  assert.equal(score.total, expectedScores.poses[id].total, `${id} total`);
  assert.deepEqual(score.terms, expectedScores.poses[id].terms, `${id} terms`);
}
assert.equal(system.scoring.referencePoseScore, scored.reference.total);
for (const id of Object.keys(scored).filter((id) => id !== "reference")) {
  assert.ok(
    scored.reference.total < scored[id].total,
    `reference ${scored.reference.total} must beat ${id} ${scored[id].total}`,
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      directoryBytes,
      budgetBytes: maximumDirectoryBytes,
      comparedGridValues,
      receptorAtomsCompared: receptorSource.length,
      ligandAtomsCompared: ligandSource.length,
      displayBonds: system.ligand.bonds.length,
      scores: Object.fromEntries(
        Object.entries(scored).map(([id, score]) => [id, score.total]),
      ),
    },
    null,
    2,
  ),
);
