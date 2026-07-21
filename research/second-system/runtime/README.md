# 3CE3 compact runtime release candidate

This directory is the independently verifiable source bundle for SNAP's second
runtime system. It contains the human c-MET kinase domain and experimental
inhibitor **1FN** from [PDB 3CE3](https://www.rcsb.org/structure/3CE3), plus all
eight target-specific AutoGrid channels. Its three runtime assets are copied
byte-for-byte into `public/data/` and loaded only when 3CE3 is selected.

## Scientific boundary

- 1FN is an **experimental inhibitor**, not an approved medicine.
- The pose is the pinned upstream prepared co-crystal input pose. SNAP did not
  predict it.
- The live value is a rigid-pose AutoGrid intermolecular energy readout:
  `atom-type affinity + q*electrostatics + abs(q)*desolvation`.
- It is not measured affinity, predictive docking, a drug recommendation, or a
  clinical result.
- Coordinates, partial charges, AutoDock types, and grid scalars are preserved.
  The only inferred data are display-only ligand bonds; they never enter the
  score.

## Runtime schema

`3ce3-system.json` uses the `PreparedSystem` shape already consumed by
`SnapExperience.tsx`. Coordinates stay in the upstream PDBQT source frame.
`frame.referenceLigandCentroid` is the centroid of all 37 prepared ligand atoms.
The receptor atom objects deliberately omit atom `name` and per-atom `chainId`
to fit the payload budget; residue name/number remain, and `receptor.chainId`
records that every receptor atom is chain A.

`3ce3-autogrid-runtime.json` uses the existing runtime AutoGrid shape:

- dimensions are grid-point counts, not `NELEMENTS` intervals;
- linear index is `x + nx * (y + ny * z)` (x-fastest);
- the binary is little-endian Float32, channel-major;
- channel order is `A,C,F,OA,N,HD,e,d`;
- each `byteOffsets[channel]` points to exactly 92,455 Float32 values.

`bundle-manifest.json` records exact byte counts and SHA-256 hashes for every
other file in this directory. It excludes itself to avoid a circular hash.

## Build and verify

From the repository root:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 research/second-system/runtime/build.py
./node_modules/.bin/tsx research/second-system/runtime/verify.mts
```

The verifier independently reparses the pinned ASCII maps, compares all 739,640
Float32 values with the binary payload, compares every prepared atom with its
PDBQT source, checks hashes and the 3.5 MB directory cap, then runs the current
`app/lib/scoring.ts` scorer against the reference plus three in-grid decoys.

## Promotion record

The public copies retain the embedded `/data/...` URLs, use the existing shared
parser and scorer, lazy-load the 2,958,560-byte grid binary, and identify 1FN as
an experimental inhibitor. `verify.mts`, the public-asset regression test, the
target-switch path, the reveal path, and the full browser receipt were rerun
after promotion. Integration remains gated on the source hashes, per-value and
per-atom comparisons, exact score assertions, license copy, and payload budget.
