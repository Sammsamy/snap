import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  IDENTITY_POSE,
  createAutoGridMapSet,
  parseAutoGridMap,
  quaternionFromAxisAngle,
  scorePoseWithAutoGrid,
  type AutoGridMapSet,
  type LigandPose,
  type MolecularAtom,
  type Vec3,
} from "../../app/lib/scoring";

const here = path.dirname(fileURLToPath(import.meta.url));
const raw = path.join(here, "raw");
const affinityChannels = ["A", "C", "F", "OA", "N", "HD"] as const;
const allChannels = [...affinityChannels, "e", "d"] as const;

function read(name: string): string {
  return fs.readFileSync(path.join(raw, name), "utf8");
}

function elementForType(type: string): string {
  if (type === "HD" || type === "HS") return "H";
  if (type === "OA" || type === "OS") return "O";
  if (type === "NA" || type === "NS" || type === "N") return "N";
  if (type === "SA" || type === "S") return "S";
  if (type === "A" || type === "C") return "C";
  return type.replace(/[^A-Za-z]/g, "") || "C";
}

function parseLigandPdbqt(text: string): MolecularAtom[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("ATOM") || line.startsWith("HETATM"))
    .map((line, index) => {
      const fields = line.trim().split(/\s+/);
      const autodockType = fields.at(-1) ?? "C";
      // PDBQT inherits fixed-width PDB coordinates. Whitespace token positions
      // are not stable because this upstream file writes chain+residue as A1401.
      const name = line.slice(12, 16).trim();
      const partialCharge = Number(fields.at(-2));
      const position = {
        x: Number(line.slice(30, 38)),
        y: Number(line.slice(38, 46)),
        z: Number(line.slice(46, 54)),
      };
      assert.ok(Object.values(position).every(Number.isFinite), `bad coordinates: ${line}`);
      assert.ok(Number.isFinite(partialCharge), `bad charge: ${line}`);
      return {
        id: `${name}-${index + 1}`,
        name,
        residueName: line.slice(17, 20).trim(),
        residueNumber: Number(line.slice(22, 26)),
        chain: line.slice(21, 22).trim(),
        position,
        element: elementForType(autodockType),
        autodockType,
        partialCharge,
        donor: autodockType === "HD" || autodockType === "HS",
        acceptor: ["OA", "OS", "NA", "NS", "SA"].includes(autodockType),
      } satisfies MolecularAtom;
    });
}

function centroid(atoms: readonly MolecularAtom[]): Vec3 {
  return atoms.reduce(
    (sum, atom) => ({
      x: sum.x + atom.position.x / atoms.length,
      y: sum.y + atom.position.y / atoms.length,
      z: sum.z + atom.position.z / atoms.length,
    }),
    { x: 0, y: 0, z: 0 },
  );
}

function pointInsideFullInterpolationCell(grid: AutoGridMapSet, point: Vec3): boolean {
  const x = (point.x - grid.origin.x) / grid.spacing;
  const y = (point.y - grid.origin.y) / grid.spacing;
  const z = (point.z - grid.origin.z) / grid.spacing;
  // AutoDock-GPU rejects >= gridSize-1: interpolation needs the next grid point.
  return (
    x >= 0 &&
    y >= 0 &&
    z >= 0 &&
    x < grid.dimensions.x - 1 &&
    y < grid.dimensions.y - 1 &&
    z < grid.dimensions.z - 1
  );
}

const maps = allChannels.map((channel) =>
  parseAutoGridMap(channel, read(`3ce3_protein.${channel}.map`)),
);
const grid = createAutoGridMapSet(maps);
const ligand = parseLigandPdbqt(read("3ce3_ligand.pdbqt"));
const ligandTypes = [...new Set(ligand.map((atom) => String(atom.autodockType)))].sort();
const missingChannels = ligandTypes.filter(
  (type) => !Object.prototype.hasOwnProperty.call(grid.affinityMaps, type),
);
assert.deepEqual(missingChannels, [], "every ligand type needs a matching affinity map");
assert.deepEqual(
  [grid.dimensions.x, grid.dimensions.y, grid.dimensions.z],
  [41, 55, 41],
  "unexpected grid dimensions",
);
assert.equal(grid.spacing, 0.375);

const pivot = centroid(ligand);
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
    pivot,
  },
};

const scored = Object.fromEntries(
  Object.entries(poses).map(([id, pose]) => {
    const score = scorePoseWithAutoGrid(grid, ligand, pose);
    const transformed = score.atomScores.map((atom) => atom.position);
    const strictOutsideAtoms = transformed.filter(
      (point) => !pointInsideFullInterpolationCell(grid, point),
    ).length;
    return [
      id,
      {
        total: score.total,
        terms: score.terms,
        scorerOutsideAtoms: score.outsideGridAtoms,
        strictOutsideAtoms,
      },
    ];
  }),
);

assert.equal(scored.reference.strictOutsideAtoms, 0, "reference pose must be strictly in-grid");
const inGridDecoys = Object.entries(scored).filter(
  ([id, score]) => id !== "reference" && score.strictOutsideAtoms === 0,
);
assert.ok(inGridDecoys.length >= 2, "need at least two fully in-grid decoys");
for (const [id, score] of inGridDecoys) {
  assert.ok(
    scored.reference.total < score.total,
    `reference score ${scored.reference.total} did not beat ${id} ${score.total}`,
  );
}

const report = {
  schemaVersion: 1,
  system: "3CE3 c-MET kinase domain + experimental inhibitor 1FN",
  scorer: "current app/lib/scoring.ts AutoGrid trilinear scorer",
  formula: "atom-type affinity map + q*electrostatics map + abs(q)*desolvation map",
  grid: {
    spacingAngstrom: grid.spacing,
    dimensions: grid.dimensions,
    center: grid.center,
    origin: grid.origin,
    affinityChannels,
    totalChannels: allChannels.length,
  },
  ligand: {
    atoms: ligand.length,
    atomTypes: ligandTypes,
    pivot,
  },
  poses: scored,
  referenceRanksFirstAmongFullyInGridPanel: true,
  compatibleWithCurrentScorer: true,
  caveats: [
    "The reference is the upstream prepared co-crystal input pose, not a newly predicted pose.",
    "The map total is a rigid-pose AutoGrid score, not measured affinity and not a docking result.",
    "1FN is an experimental c-MET inhibitor; do not call it an approved medicine.",
    "Exact upstream maps are target/grid/preparation-specific and total about 5.6 MB as text.",
  ],
};

fs.writeFileSync(path.join(here, "scores.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
