import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  IDENTITY_POSE,
  quaternionFromAxisAngle,
  scorePose,
  scorePoseWithAutoGrid,
  type AutoGridMapSet,
  type LigandPose,
  type MolecularAtom,
  type Vec3,
} from "../app/lib/scoring";

const CHANNELS = ["A", "C", "F", "OA", "N", "HD", "e", "d"] as const;
const EXPECTED_HASHES = {
  system: "7f4967f7d616685a4a0e42f9bc5b71720142b80ab6993a21a5520961ad6e014f",
  manifest: "81c6644e7d30a8b61c3d26d64cb6d00da71d881de11486ebd61aca45bb01e014",
  binary: "4ced0694b0cb9252788b1eaf0009183a802305024f598406acab8f3148be3502",
} as const;

const EXPECTED_POSES = {
  reference: {
    total: -11.6442810143,
    terms: {
      affinity: -15.3592972297,
      electrostatics: -0.18616824385,
      desolvation: 3.90118445924,
      outsideGridPenalty: 0,
    },
  },
  translated_x_minus_1: {
    total: -0.089824719912,
    terms: {
      affinity: -3.3378647608,
      electrostatics: -0.446754743182,
      desolvation: 3.69479478407,
      outsideGridPenalty: 0,
    },
  },
  translated_z_plus_1: {
    total: 3.03447033419,
    terms: {
      affinity: -0.778020231632,
      electrostatics: -0.222216488198,
      desolvation: 4.03470705402,
      outsideGridPenalty: 0,
    },
  },
  rotated_z_15deg: {
    total: 145.802134522,
    terms: {
      affinity: 142.063181832,
      electrostatics: -0.376417087173,
      desolvation: 4.11536977728,
      outsideGridPenalty: 0,
    },
  },
} as const;

interface PreparedAtom {
  id: number;
  element: string;
  name?: string;
  residueName?: string;
  residueNumber?: number;
  chainId?: string;
  position: [number, number, number];
  partialCharge: number;
  autodockType: string;
}

interface PreparedSystem {
  system: {
    entryId: string;
    ligand: { ccdId: string; name: string };
    limitations: string[];
  };
  frame: { referenceLigandCentroid: [number, number, number] };
  receptor: { atoms: PreparedAtom[] };
  ligand: {
    atoms: PreparedAtom[];
    referencePose: { positions: Array<[number, number, number]> };
  };
  scoring: {
    autoGridManifest: string;
    referencePoseScore: number;
    interpretation: string;
  };
}

interface GridManifest {
  autoGrid: {
    spacing: number;
    dimensions: { x: number; y: number; z: number };
    center: [number, number, number];
    origin: [number, number, number];
    channelOrder: string[];
    binary: {
      url: string;
      dtype: string;
      endianness: string;
      layout: string;
      valuesPerChannel: number;
      bytesPerChannel: number;
      byteOffsets: Record<string, number>;
      byteLength: number;
      sha256: string;
    };
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function vector(values: readonly number[]): Vec3 {
  return { x: values[0], y: values[1], z: values[2] };
}

function asMolecularAtom(atom: PreparedAtom): MolecularAtom {
  const type = atom.autodockType.toUpperCase();
  return {
    id: String(atom.id),
    name: atom.name,
    residueName: atom.residueName,
    residueNumber: atom.residueNumber,
    chain: atom.chainId,
    position: vector(atom.position),
    element: atom.element,
    autodockType: atom.autodockType,
    partialCharge: atom.partialCharge,
    donor: type === "HD" || type === "HS",
    acceptor: ["OA", "OS", "NA", "NS", "SA"].includes(type),
  };
}

function readFloat32Channel(
  binary: Buffer,
  byteOffset: number,
  count: number,
): Float32Array {
  const values = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    values[index] = binary.readFloatLE(byteOffset + index * 4);
  }
  return values;
}

test("public 3CE3 assets preserve the exact audited four-pose AutoGrid panel", async () => {
  const [systemBytes, manifestBytes, binary] = await Promise.all([
    readFile(new URL("../public/data/3ce3-system.json", import.meta.url)),
    readFile(new URL("../public/data/3ce3-autogrid-runtime.json", import.meta.url)),
    readFile(new URL("../public/data/3ce3-autogrid.f32", import.meta.url)),
  ]);

  assert.equal(sha256(systemBytes), EXPECTED_HASHES.system);
  assert.equal(sha256(manifestBytes), EXPECTED_HASHES.manifest);
  assert.equal(sha256(binary), EXPECTED_HASHES.binary);

  const system = JSON.parse(systemBytes.toString("utf8")) as PreparedSystem;
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as GridManifest;
  const prepared = manifest.autoGrid;
  assert.equal(system.system.entryId, "3CE3");
  assert.equal(system.system.ligand.ccdId, "1FN");
  assert.match(system.system.ligand.name, /experimental inhibitor/i);
  assert.ok(system.system.limitations.some((item) => /not an approved medicine/i.test(item)));
  assert.match(system.scoring.interpretation, /not a binding free energy/i);
  assert.equal(system.scoring.autoGridManifest, "/data/3ce3-autogrid-runtime.json");
  assert.equal(system.receptor.atoms.length, 2_836);
  assert.equal(system.ligand.atoms.length, 37);
  assert.equal(system.ligand.referencePose.positions.length, 37);

  assert.deepEqual(prepared.dimensions, { x: 41, y: 55, z: 41 });
  assert.equal(prepared.spacing, 0.375);
  assert.deepEqual(prepared.channelOrder, CHANNELS);
  assert.equal(prepared.binary.dtype, "float32");
  assert.equal(prepared.binary.endianness, "little");
  assert.equal(prepared.binary.layout, "channel-major");
  assert.equal(prepared.binary.valuesPerChannel, 92_455);
  assert.equal(prepared.binary.bytesPerChannel, 369_820);
  assert.equal(prepared.binary.byteLength, 2_958_560);
  assert.equal(binary.byteLength, prepared.binary.byteLength);
  assert.equal(prepared.binary.sha256, EXPECTED_HASHES.binary);

  const maps = Object.fromEntries(
    CHANNELS.map((channel, channelIndex) => {
      const expectedOffset = channelIndex * prepared.binary.bytesPerChannel;
      assert.equal(prepared.binary.byteOffsets[channel], expectedOffset);
      const values = readFloat32Channel(
        binary,
        expectedOffset,
        prepared.binary.valuesPerChannel,
      );
      assert.ok(values.every(Number.isFinite), `${channel} must contain only finite values`);
      return [channel, values];
    }),
  );
  const grid: AutoGridMapSet = {
    spacing: prepared.spacing,
    dimensions: prepared.dimensions,
    center: vector(prepared.center),
    origin: vector(prepared.origin),
    affinityMaps: Object.fromEntries(
      CHANNELS.filter((channel) => channel !== "e" && channel !== "d").map(
        (channel) => [channel, maps[channel]],
      ),
    ),
    electrostaticsMap: maps.e,
    desolvationMap: maps.d,
  };

  const ligand = system.ligand.atoms.map(asMolecularAtom);
  const receptor = system.receptor.atoms.map(asMolecularAtom);
  const pivot = vector(system.frame.referenceLigandCentroid);
  const poses: Record<keyof typeof EXPECTED_POSES, LigandPose> = {
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

  for (const id of Object.keys(poses) as Array<keyof typeof poses>) {
    const score = scorePoseWithAutoGrid(grid, ligand, poses[id]);
    assert.equal(score.total, EXPECTED_POSES[id].total, `${id} total`);
    assert.deepEqual(score.terms, EXPECTED_POSES[id].terms, `${id} terms`);
    assert.equal(score.outsideGridAtoms, 0, `${id} outside-grid atom count`);
    assert.equal(score.atomScores.length, ligand.length, `${id} scored atom count`);
    assert.ok(
      score.atomScores.every((atom) => !atom.outsideGrid),
      `${id} must keep every ligand atom inside a complete interpolation cell`,
    );
  }

  assert.equal(system.scoring.referencePoseScore, EXPECTED_POSES.reference.total);

  const challengeGeometry = scorePose(
    receptor,
    ligand,
    poses.rotated_z_15deg,
  );
  const referenceGeometry = scorePose(receptor, ligand, poses.reference);
  assert.equal(challengeGeometry.clashes.count, 17);
  assert.equal(referenceGeometry.clashes.count, 1);
  assert.equal(challengeGeometry.hydrogenBonds.length, 4);
  assert.equal(referenceGeometry.hydrogenBonds.length, 3);
});
