import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTRIBUTION_LENS_MODEL,
  CONTRIBUTION_LENS_SCOPE,
  CONTRIBUTION_TONE_STYLES,
  createContributionLens,
  contributionStyleForDelta,
  contributionToneForDelta,
  rankAtomContributions,
  type AtomContributionDelta,
  type ScopedAutoGridScore,
} from "../app/lib/contributionLens";
import {
  AUTOGRID_MODEL_NAME,
  type AutoGridAtomScore,
  type AutoGridScoreBreakdown,
} from "../app/lib/scoring";

function atom(
  atomId: string,
  affinity: number,
  electrostatics: number,
  desolvation: number,
  overrides: Partial<AutoGridAtomScore> = {},
): AutoGridAtomScore {
  return {
    atomId,
    mapType: "C",
    position: { x: 0, y: 0, z: 0 },
    affinity,
    electrostatics,
    desolvation,
    total: affinity + electrostatics + desolvation,
    outsideGrid: false,
    ...overrides,
  };
}

function breakdown(atoms: AutoGridAtomScore[]): AutoGridScoreBreakdown {
  const affinity = atoms.reduce((sum, item) => sum + item.affinity, 0);
  const electrostatics = atoms.reduce(
    (sum, item) => sum + item.electrostatics,
    0,
  );
  const desolvation = atoms.reduce((sum, item) => sum + item.desolvation, 0);
  const total = atoms.reduce((sum, item) => sum + item.total, 0);
  return {
    model: AUTOGRID_MODEL_NAME,
    terms: { affinity, electrostatics, desolvation, outsideGridPenalty: 0 },
    total,
    outsideGridAtoms: 0,
    atomScores: atoms,
  };
}

function scoped(
  poseLabel: string,
  atoms: AutoGridAtomScore[],
  systemId = "prepared-system",
): ScopedAutoGridScore {
  return { systemId, poseLabel, score: breakdown(atoms) };
}

test("derives exact atom, term, and total deltas with a conserved top-three panel", () => {
  const baseline = scoped("challenge", [
    atom("a", 2, 0.2, 0.1),
    atom("b", -1, -0.2, 0.4),
    atom("c", 0.5, 0, 0),
    atom("d", 1, 0, 0),
    atom("e", 0, 0, 0),
  ]);
  const current = scoped("reference", [
    atom("a", 0, 0.1, 0.1),
    atom("b", 0.5, 0.3, 0.4),
    atom("c", -0.5, 0, 0),
    atom("d", 0, 0, 0),
    atom("e", 0.001, 0, 0),
  ]);

  const lens = createContributionLens(baseline, current);

  assert.equal(lens.model, CONTRIBUTION_LENS_MODEL);
  assert.equal(lens.scope, CONTRIBUTION_LENS_SCOPE);
  assert.equal(lens.systemId, "prepared-system");
  assert.equal(lens.direction, "current-minus-baseline");
  assert.equal(lens.atomCount, 5);
  assert.deepEqual(lens.termDelta, {
    affinity: -2.499,
    electrostatics: 0.4,
    desolvation: 0,
  });
  assert.equal(lens.totalDelta, -2.099);
  assert.deepEqual(lens.contributions[0].delta, {
    affinity: -2,
    electrostatics: -0.1,
    desolvation: 0,
    total: -2.1,
  });
  assert.equal(lens.contributions[0].tone, "favorable");
  assert.equal(lens.contributions[1].tone, "unfavorable");
  assert.equal(lens.contributions[4].tone, "neutral");
  assert.deepEqual(
    lens.topContributors.map((item) => item.atomId),
    ["a", "b", "c"],
  );
  assert.equal(lens.conservation.invariantMet, true);
  assert.ok(
    Object.values(lens.conservation.residual).every(
      (value) => Math.abs(value) <= lens.conservation.tolerance,
    ),
  );
  assert.ok(Object.isFrozen(lens));
  assert.ok(Object.isFrozen(lens.contributions));
});

test("stable ranking uses ligand order to resolve equal absolute deltas", () => {
  const rows = [
    { atomId: "first", atomIndex: 0, absoluteTotalDelta: 2 },
    { atomId: "second", atomIndex: 1, absoluteTotalDelta: 2 },
    { atomId: "third", atomIndex: 2, absoluteTotalDelta: 1 },
    { atomId: "fourth", atomIndex: 3, absoluteTotalDelta: 3 },
  ] as AtomContributionDelta[];

  assert.deepEqual(
    rankAtomContributions(rows).map((item) => item.atomId),
    ["fourth", "first", "second"],
  );
  assert.deepEqual(rows.map((item) => item.atomId), [
    "first",
    "second",
    "third",
    "fourth",
  ]);
  assert.throws(() => rankAtomContributions(rows, -1), /non-negative integer/i);
});

test("tone and accessible color mapping are deterministic and non-color-only", () => {
  assert.equal(contributionToneForDelta(-0.006), "favorable");
  assert.equal(contributionToneForDelta(-0.005), "neutral");
  assert.equal(contributionToneForDelta(0), "neutral");
  assert.equal(contributionToneForDelta(0.005), "neutral");
  assert.equal(contributionToneForDelta(0.006), "unfavorable");
  assert.deepEqual(contributionStyleForDelta(-1), {
    label: "More favorable",
    colorName: "cyan",
    hex: "#67E8F9",
  });
  assert.deepEqual(contributionStyleForDelta(0), {
    label: "Little or no displayed change",
    colorName: "slate",
    hex: "#CBD5E1",
  });
  assert.deepEqual(contributionStyleForDelta(1), {
    label: "Less favorable",
    colorName: "coral",
    hex: "#FDA4AF",
  });
  for (const style of Object.values(CONTRIBUTION_TONE_STYLES)) {
    assert.ok(style.label.length > 0);
    assert.match(style.hex, /^#[0-9A-F]{6}$/);
  }
  assert.throws(() => contributionToneForDelta(Number.NaN), /finite/i);
  assert.throws(() => contributionToneForDelta(0, -0.1), /greater than or equal/i);
});

test("fails closed on cross-system, atom identity, order, map, and grid violations", () => {
  const baseline = scoped("challenge", [atom("a", 1, 0, 0), atom("b", 2, 0, 0)]);

  assert.throws(
    () => createContributionLens(baseline, scoped("reference", [atom("a", 0, 0, 0), atom("b", 1, 0, 0)], "other")),
    /cannot compare systems/i,
  );
  assert.throws(
    () => createContributionLens(baseline, scoped("reference", [atom("b", 1, 0, 0), atom("a", 0, 0, 0)])),
    /atom order mismatch/i,
  );
  assert.throws(
    () => createContributionLens(baseline, scoped("reference", [atom("a", 0, 0, 0), atom("c", 1, 0, 0)])),
    /atom order mismatch/i,
  );
  assert.throws(
    () => createContributionLens(baseline, scoped("reference", [atom("a", 0, 0, 0, { mapType: "A" }), atom("b", 1, 0, 0)])),
    /map type mismatch/i,
  );
  assert.throws(
    () => createContributionLens(baseline, scoped("reference", [atom("a", 0, 0, 0)])),
    /atom counts do not match/i,
  );
  assert.throws(
    () => createContributionLens(scoped("challenge", [atom("a", 1, 0, 0), atom("a", 2, 0, 0)]), baseline),
    /duplicate atom id/i,
  );
  assert.throws(
    () => createContributionLens(scoped("challenge", [atom("a", 1, 0, 0, { outsideGrid: true })]), scoped("reference", [atom("a", 0, 0, 0)])),
    /outside the AutoGrid/i,
  );

  const outsideCount = scoped("challenge", [atom("a", 1, 0, 0)]);
  outsideCount.score.outsideGridAtoms = 1;
  assert.throws(
    () => createContributionLens(outsideCount, scoped("reference", [atom("a", 0, 0, 0)])),
    /outside-grid atoms/i,
  );
});

test("rejects non-finite or internally non-conserving score panels", () => {
  const finite = scoped("reference", [atom("a", 0, 0, 0)]);
  assert.throws(
    () => createContributionLens(scoped("challenge", [atom("a", Number.NaN, 0, 0)]), finite),
    /finite/i,
  );
  assert.throws(
    () => createContributionLens(scoped("challenge", [atom("a", 1, 0, 0, { position: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 } })]), finite),
    /finite/i,
  );

  const badAtomTotal = scoped("challenge", [atom("a", 1, 0, 0, { total: 2 })]);
  assert.throws(
    () => createContributionLens(badAtomTotal, finite),
    /violates contribution conservation/i,
  );

  const badAggregate = scoped("challenge", [atom("a", 1, 0, 0)]);
  badAggregate.score.terms.affinity = 2;
  badAggregate.score.total = 2;
  assert.throws(
    () => createContributionLens(badAggregate, finite),
    /affinity sum.*violates contribution conservation/i,
  );
});

test("accepts scorer-scale independent rounding while reporting its residual", () => {
  const baseline = scoped("challenge", [
    atom("a", 100.00000000004, 0, 0),
    atom("b", 50.00000000004, 0, 0),
  ]);
  const current = scoped("reference", [
    atom("a", 90.00000000003, 0, 0),
    atom("b", 40.00000000003, 0, 0),
  ]);
  // Mimic scorer aggregate rounding independently of its atom rows.
  baseline.score.terms.affinity = 150.0000000001;
  baseline.score.total = 150.0000000001;
  current.score.terms.affinity = 130.0000000001;
  current.score.total = 130.0000000001;

  const lens = createContributionLens(baseline, current);
  assert.equal(lens.totalDelta, -20);
  assert.equal(lens.conservation.invariantMet, true);
  assert.ok(
    Math.abs(lens.conservation.residual.total) <= lens.conservation.tolerance,
  );
});
