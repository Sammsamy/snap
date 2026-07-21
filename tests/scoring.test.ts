import assert from "node:assert/strict";
import test from "node:test";

import {
  createAutoGridMapSet,
  IDENTITY_POSE,
  parseAutoGridMap,
  quaternionFromAxisAngle,
  scorePose,
  scorePosePanel,
  scorePoseWithAutoGrid,
  transformLigandAtoms,
  transformPoint,
  type LigandPose,
  type MolecularAtom,
  type Vec3,
} from "../app/lib/scoring";

const vector = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function atom(
  id: string,
  position: Vec3,
  overrides: Partial<MolecularAtom> = {},
): MolecularAtom {
  return {
    id,
    position,
    element: "C",
    autodockType: "C",
    partialCharge: 0,
    donor: false,
    acceptor: false,
    ...overrides,
  };
}

test("overlapping atoms remain finite and produce a bounded clash", () => {
  const result = scorePose(
    [atom("receptor-C", vector(0, 0, 0))],
    [atom("ligand-C", vector(0, 0, 0))],
  );

  assert.equal(result.clashes.count, 1);
  assert.equal(result.clashes.pairs.length, 1);
  assert.equal(result.clashes.pairs[0].severity, 1);
  assert.ok(Number.isFinite(result.total));
  assert.ok(Number.isFinite(result.terms.vanDerWaals));
  assert.ok(result.terms.vanDerWaals <= 8);
});

test("electrostatics has the correct sign for like and opposite charges", () => {
  const positiveReceptor = atom("positive-receptor", vector(0, 0, 0), {
    partialCharge: 0.6,
  });
  const opposite = atom("negative-ligand", vector(5, 0, 0), {
    partialCharge: -0.6,
  });
  const like = { ...opposite, id: "positive-ligand", partialCharge: 0.6 };

  const attractive = scorePose([positiveReceptor], [opposite]);
  const repulsive = scorePose([positiveReceptor], [like]);

  assert.ok(attractive.terms.electrostatics < 0);
  assert.ok(repulsive.terms.electrostatics > 0);
  assert.ok(
    Math.abs(Math.abs(attractive.terms.electrostatics) - repulsive.terms.electrostatics) < 1e-10,
  );
});

test("hydrogen bonds require both range and available directional geometry", () => {
  const donor = atom("donor-N", vector(0, 0, 0), {
    element: "N",
    autodockType: "N",
    donor: true,
    donorDirection: vector(1, 0, 0),
    partialCharge: 0.3,
  });
  const acceptor = atom("acceptor-O", vector(2.9, 0, 0), {
    element: "O",
    autodockType: "OA",
    acceptor: true,
    acceptorDirection: vector(-1, 0, 0),
    partialCharge: -0.3,
  });

  const aligned = scorePose([acceptor], [donor]);
  const misaligned = scorePose(
    [acceptor],
    [{ ...donor, donorDirection: vector(-1, 0, 0) }],
  );
  const tooFar = scorePose(
    [{ ...acceptor, position: vector(5, 0, 0) }],
    [donor],
  );

  assert.equal(aligned.hydrogenBonds.length, 1);
  assert.ok(aligned.terms.hydrogenBond < 0);
  assert.equal(aligned.hydrogenBonds[0].geometryFactor, 1);
  assert.equal(misaligned.hydrogenBonds.length, 0);
  assert.equal(misaligned.terms.hydrogenBond, 0);
  assert.equal(tooFar.hydrogenBonds.length, 0);
  assert.equal(tooFar.terms.hydrogenBond, 0);
});

test("explicit donor hydrogens use the AD4-like 1.9 A radial optimum", () => {
  const donorHydrogen = atom("donor-H", vector(0, 0, 0), {
    element: "H",
    autodockType: "HD",
    donor: true,
    donorDirection: vector(1, 0, 0),
  });
  const acceptor = atom("acceptor-O", vector(1.9, 0, 0), {
    element: "O",
    autodockType: "OA",
    acceptor: true,
    acceptorDirection: vector(-1, 0, 0),
  });

  const result = scorePose([acceptor], [donorHydrogen]);

  assert.equal(result.hydrogenBonds.length, 1);
  assert.ok(result.terms.hydrogenBond < -0.5);
  assert.equal(result.terms.vanDerWaals, 0);
  assert.equal(result.clashes.count, 0);
});

test("steric clash count and severity disappear after a large displacement", () => {
  const receptor = [atom("receptor", vector(0, 0, 0))];
  const ligand = [atom("ligand", vector(1, 0, 0))];
  const clashing = scorePose(receptor, ligand);
  const separated = scorePose(receptor, ligand, {
    ...IDENTITY_POSE,
    translation: vector(10, 0, 0),
  });

  assert.equal(clashing.clashes.count, 1);
  assert.ok(clashing.clashes.severity > 0);
  assert.equal(separated.clashes.count, 0);
  assert.equal(separated.clashes.severity, 0);
});

test("the same inputs produce byte-for-byte deterministic results", () => {
  const receptor = [
    atom("r1", vector(0, 0, 0), { partialCharge: -0.25 }),
    atom("r2", vector(3, 1, 0), { element: "N", autodockType: "N", partialCharge: 0.2 }),
  ];
  const ligand = [
    atom("l1", vector(2.5, 0, 0), { partialCharge: 0.3 }),
    atom("l2", vector(4, 1, 0), { element: "O", autodockType: "OA", partialCharge: -0.2 }),
  ];

  assert.deepEqual(scorePose(receptor, ligand), scorePose(receptor, ligand));
  assert.equal(
    JSON.stringify(scorePose(receptor, ligand)),
    JSON.stringify(scorePose(receptor, ligand)),
  );
});

test("rigid transform rotates around a pivot, translates, and preserves distances", () => {
  const rotation = quaternionFromAxisAngle(vector(0, 0, 1), Math.PI / 2);
  const pose: LigandPose = {
    translation: vector(1, 2, 3),
    rotation,
    pivot: vector(0, 0, 0),
  };
  const transformedPoint = transformPoint(vector(1, 0, 0), pose);
  assert.ok(Math.abs(transformedPoint.x - 1) < 1e-10);
  assert.ok(Math.abs(transformedPoint.y - 3) < 1e-10);
  assert.ok(Math.abs(transformedPoint.z - 3) < 1e-10);

  const ligand = [
    atom("a", vector(1, 0, 0), { donorDirection: vector(1, 0, 0) }),
    atom("b", vector(3, 0, 0)),
  ];
  const transformed = transformLigandAtoms(ligand, pose);
  const before = Math.hypot(
    ligand[1].position.x - ligand[0].position.x,
    ligand[1].position.y - ligand[0].position.y,
    ligand[1].position.z - ligand[0].position.z,
  );
  const after = Math.hypot(
    transformed[1].position.x - transformed[0].position.x,
    transformed[1].position.y - transformed[0].position.y,
    transformed[1].position.z - transformed[0].position.z,
  );
  assert.ok(Math.abs(before - after) < 1e-10);
  assert.ok(Math.abs((transformed[0].donorDirection?.x ?? 1) - 0) < 1e-10);
  assert.ok(Math.abs((transformed[0].donorDirection?.y ?? 0) - 1) < 1e-10);
});

test("pose panel sorts deterministically by lower (more favorable) score", () => {
  // This synthetic pocket is the integration-test scaffold. Once the prepared
  // public/data manifest lands, use its receptor/ligand arrays and replace this
  // with a crystal pose plus explicit translated/rotated decoys.
  const receptor = [
    atom("acceptor", vector(2.9, 0, 0), {
      element: "O",
      autodockType: "OA",
      acceptor: true,
      acceptorDirection: vector(-1, 0, 0),
      partialCharge: -0.3,
    }),
  ];
  const ligand = [
    atom("donor", vector(0, 0, 0), {
      element: "N",
      autodockType: "N",
      donor: true,
      donorDirection: vector(1, 0, 0),
      partialCharge: 0.3,
    }),
  ];
  const panel = scorePosePanel(receptor, ligand, [
    { id: "far-decoy", pose: { ...IDENTITY_POSE, translation: vector(-8, 0, 0) } },
    { id: "crystal-like", pose: IDENTITY_POSE },
    {
      id: "rotated-decoy",
      pose: {
        ...IDENTITY_POSE,
        rotation: quaternionFromAxisAngle(vector(0, 0, 1), Math.PI),
      },
    },
  ]);

  assert.equal(panel[0].id, "crystal-like");
  assert.ok(panel[0].score.total < panel[1].score.total);
  assert.ok(panel[0].score.total < panel[2].score.total);
});

test("invalid non-finite scientific inputs fail closed instead of leaking NaN", () => {
  assert.throws(
    () => scorePose([atom("bad", vector(Number.NaN, 0, 0))], [atom("ligand", vector(0, 0, 0))]),
    /must be finite/,
  );
});

function syntheticMap(values: readonly number[]): string {
  return [
    "GRID_PARAMETER_FILE synthetic.gpf",
    "GRID_DATA_FILE synthetic.maps.fld",
    "MACROMOLECULE synthetic.pdbqt",
    "SPACING 1.0",
    "NELEMENTS 1 1 1",
    "CENTER 0.5 0.5 0.5",
    ...values.map(String),
  ].join("\n");
}

test("AutoGrid parser honors x-fast file order and trilinear interpolation", () => {
  // f(x,y,z) = x + 10y + 100z at the 2x2x2 corners. AutoGrid writes
  // x fastest, then y, then z, so the cube center must interpolate to 55.5.
  const affinity = parseAutoGridMap(
    "C",
    syntheticMap([0, 1, 10, 11, 100, 101, 110, 111]),
  );
  const electrostatics = parseAutoGridMap("e", syntheticMap(Array(8).fill(2)));
  const desolvation = parseAutoGridMap("d", syntheticMap(Array(8).fill(3)));
  const grid = createAutoGridMapSet([affinity, electrostatics, desolvation]);
  const ligand = [
    atom("grid-C", vector(0.5, 0.5, 0.5), {
      partialCharge: -0.5,
    }),
  ];

  const result = scorePoseWithAutoGrid(grid, ligand);

  assert.equal(affinity.dimensions.x, 2);
  assert.equal(affinity.dimensions.y, 2);
  assert.equal(affinity.dimensions.z, 2);
  assert.deepEqual(affinity.origin, vector(0, 0, 0));
  assert.equal(result.terms.affinity, 55.5);
  assert.equal(result.terms.electrostatics, -1);
  assert.equal(result.terms.desolvation, 1.5);
  assert.equal(result.total, 56);
  assert.equal(result.outsideGridAtoms, 0);
});

test("AutoGrid scorer returns an explicit finite out-of-grid penalty", () => {
  const grid = createAutoGridMapSet([
    parseAutoGridMap("C", syntheticMap(Array(8).fill(-1))),
    parseAutoGridMap("e", syntheticMap(Array(8).fill(0))),
    parseAutoGridMap("d", syntheticMap(Array(8).fill(0))),
  ]);
  const result = scorePoseWithAutoGrid(
    grid,
    [atom("outside", vector(9, 9, 9))],
    IDENTITY_POSE,
    { outsideGridPenalty: 321 },
  );

  assert.equal(result.outsideGridAtoms, 1);
  assert.equal(result.terms.outsideGridPenalty, 321);
  assert.equal(result.total, 321);
  assert.equal(result.atomScores[0].outsideGrid, true);
  assert.ok(Number.isFinite(result.total));
});

test("AutoGrid scorer rejects the high boundary because interpolation needs the next cell", () => {
  const grid = createAutoGridMapSet([
    parseAutoGridMap("C", syntheticMap(Array(8).fill(-1))),
    parseAutoGridMap("e", syntheticMap(Array(8).fill(0))),
    parseAutoGridMap("d", syntheticMap(Array(8).fill(0))),
  ]);
  const result = scorePoseWithAutoGrid(
    grid,
    [atom("boundary", vector(1, 0.5, 0.5))],
    IDENTITY_POSE,
    { outsideGridPenalty: 321 },
  );

  assert.equal(result.outsideGridAtoms, 1);
  assert.equal(result.total, 321);
});

test("AutoGrid parser rejects incomplete maps and map sets reject mismatched geometry", () => {
  assert.throws(
    () => parseAutoGridMap("C", syntheticMap([1, 2, 3])),
    /expected 8 values/,
  );

  const c = parseAutoGridMap("C", syntheticMap(Array(8).fill(0)));
  const e = parseAutoGridMap(
    "e",
    syntheticMap(Array(8).fill(0)).replace("SPACING 1.0", "SPACING 0.5"),
  );
  const d = parseAutoGridMap("d", syntheticMap(Array(8).fill(0)));
  assert.throws(() => createAutoGridMapSet([c, e, d]), /geometry does not match/);
});
