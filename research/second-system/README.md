# Second-system release audit: 3CE3 c-MET + inhibitor 1FN

## Verdict

**Promoted after the primary 1STP path was stable and every release gate
passed.** The pinned upstream AutoDock-GPU benchmark is consumed unchanged by
SNAP's existing eight-channel AutoGrid scorer. Its prepared co-crystal
reference pose ranks better than three deterministic, fully in-grid rigid
decoys. The original text assets total **5,595,686 bytes**; the browser lazily
loads the verified compact binary bundle only after 3CE3 is selected.

## What the system is

- **PDB:** [3CE3](https://www.rcsb.org/structure/3CE3)
- **Target:** human c-MET / hepatocyte growth factor receptor kinase domain
- **Ligand:** PDB chemical component
  [1FN](https://www.rcsb.org/ligand/1FN), a pyrrolopyridinepyridone-based
  experimental inhibitor
- **Important claim boundary:** 1FN is not presented as an approved drug. This
  is a recognizable drug-discovery target with an experimental inhibitor.
- **Structure status:** X-ray co-complex. The reference used here is the
  upstream prepared co-crystal input pose, not a pose predicted by SNAP.

## Pinned provenance

Every raw file is copied byte-for-byte from
[`ccsb-scripps/AutoDock-GPU`](https://github.com/ccsb-scripps/AutoDock-GPU)
commit
[`89fd1c5e6b4639c22e9a2bea4cc805c42347fffb`](https://github.com/ccsb-scripps/AutoDock-GPU/commit/89fd1c5e6b4639c22e9a2bea4cc805c42347fffb).
`manifest.json` records the upstream path, pinned raw URL, byte count, and
SHA-256 for all 15 copied artifacts.

The benchmark files do not carry a separate per-file license notice. The safe
treatment is therefore the upstream repository's **GPL-2.0** license, preserved
as `UPSTREAM_LICENSE_GPL-2.0.txt`. SNAP is already GPL-2.0-or-later, but this is
a provenance audit rather than legal advice. Do not strip the upstream license,
hashes, or attribution if these files are promoted into the release.

## Grid and file layout

| Property | Verified value |
|---|---:|
| AutoGrid spacing | 0.375 A |
| `NELEMENTS` | 40 x 54 x 40 intervals |
| Stored grid points | 41 x 55 x 41 |
| Values per scalar map | 92,455 |
| Center | (20.402, 18.013, 56.855) |
| Affinity maps | A, C, F, OA, N, HD |
| Electrostatics map | e |
| Desolvation map | d |
| Total channels | 8 |
| Prepared ligand atoms | 37 |
| Prepared ligand atom types | A, C, F, HD, N, OA |

The `.map` files are ASCII scalars after their six-line preamble. AutoGrid file
order is **x-fastest**, using `x + nx * (y + ny * z)`. Trilinear interpolation
requires a full cell, so a fractional coordinate must satisfy
`0 <= coordinate < dimension - 1`; the uppermost grid plane is outside.

The score is exactly the map expression already implemented by SNAP:

```text
sum over ligand atoms:
  atom-type affinity map
  + partial_charge * electrostatics map
  + abs(partial_charge) * desolvation map
```

The first term must be called **atom-type affinity**, or described as the
precomputed vdW + hydrogen-bond + desolvation contribution. It is not merely a
shape score. The maps are already weighted; do not apply AD4 coefficients again.

## Falsification panel

All four poses have all 37 atoms inside a complete interpolation cell. Lower is
more favorable.

| Pose | Total | Atom-type affinity | Electrostatics | Desolvation | Outside atoms |
|---|---:|---:|---:|---:|---:|
| Upstream reference | **-11.644281** | -15.359297 | -0.186168 | 3.901184 | 0 |
| Translate x -1 A | -0.089825 | -3.337865 | -0.446755 | 3.694795 | 0 |
| Translate z +1 A | 3.034470 | -0.778020 | -0.222216 | 4.034707 | 0 |
| Rotate z 15 degrees | 145.802135 | 142.063182 | -0.376417 | 4.115370 | 0 |

This establishes that the current browser scorer can consume the upstream
system and that the reference outranks this defined decoy panel. It does **not**
establish calibrated affinity prediction, prospective docking performance, or
clinical relevance.

## Reproduce

From the SNAP repository root:

```bash
python3 research/second-system/prepare.py
./node_modules/.bin/tsx research/second-system/verify.mts
```

`prepare.py` is idempotent and refuses any download whose SHA-256 differs from
the pinned expectation. `verify.mts` reparses all eight maps through the current
application scorer, checks every ligand type has a map, applies strict AutoDock
grid bounds, scores the reference and decoys, and writes `scores.json`.

## Promotion record

The release copies the compact runtime files into `public/data/`, preserves the
upstream license and hashes, keeps the exact prepared coordinate frame,
lazy-loads 3CE3 only after selection, labels 1FN as experimental, and reruns the
same four-pose score panel from the public assets. The interface and docs state
that two systems do not validate docking or affinity prediction.

## Artifact index

- `manifest.json` — pin, source URLs, hashes, sizes, grid metadata, license rule
- `scores.json` — exact compatibility and decoy-score report
- `prepare.py` — reproducible pinned downloader and hash verifier
- `verify.mts` — browser-scorer compatibility/falsification runner
- `raw/3CE3.pdb` — upstream structure copy
- `raw/3ce3_protein.pdbqt` — prepared receptor
- `raw/3ce3_ligand.pdbqt` — prepared reference ligand
- `raw/3ce3_protein.{A,C,F,OA,N,HD,e,d}.map` — eight scalar maps
- `raw/3ce3_protein.maps.fld` — channel/grid descriptor
- `raw/3ce3.gpf`, `raw/3ce3.dpf` — preparation and docking parameters
- `UPSTREAM_LICENSE_GPL-2.0.txt` — preserved upstream license
