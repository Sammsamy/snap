# Third-party scientific data

## RCSB PDB / wwPDB 1STP and BTN

The deposited 1STP coordinates and BTN Chemical Component Dictionary data are provided by the RCSB Protein Data Bank/wwPDB under CC0 1.0. SNAP preserves PDB ID, DOI, publication citation, source URLs, and source hashes inside `1stp-biotin.json`.

Usage policy: https://www.rcsb.org/pages/usage-policy

## AutoDock-GPU 1STP benchmark

The PDBQT atom types/partial charges and AutoGrid map values are redistributed from the official CCSB Scripps AutoDock-GPU repository at commit `89fd1c5e6b4639c22e9a2bea4cc805c42347fffb`, path `input/1stp/derived`. The numerical files have no per-file license notice, so SNAP conservatively treats them under the repository's root GPL-2.0-or-later terms. A verbatim copy is included as `LICENSE-AUTODOCK-GPU-GPL-2.0.txt`.

Copyright (C) 2017 TU Darmstadt, Embedded Systems and Applications Group, Germany. All rights reserved. For some of the code, Copyright (C) 2019 Computational Structural Biology Center, the Scripps Research Institute. AutoDock is a Trade Mark of the Scripps Research Institute. SNAP is an independent Build Week project and is not affiliated with or endorsed by the AutoDock authors, TU Darmstadt, CCSB Scripps, or the Scripps Research Institute.

Repository: https://github.com/ccsb-scripps/AutoDock-GPU

## RCSB PDB / wwPDB 3CE3 and 1FN

The second selectable system is the human c-MET kinase domain with chemical
component 1FN from the 2.40 Å X-ray co-complex
[PDB 3CE3](https://www.rcsb.org/structure/3CE3), DOI
[10.2210/pdb3ce3/pdb](https://doi.org/10.2210/pdb3ce3/pdb). RCSB PDB/wwPDB
structure data are provided under CC0 1.0. The pinned coordinate snapshot has
SHA-256
`90dfa6c0c8bb525da7778940bdae2b7fda7016f2932ba6487eb334512ec4ade8`.

Usage policy: https://www.rcsb.org/pages/usage-policy

1FN is an **experimental pyrrolopyridinepyridone-based inhibitor**, not an
approved medicine. The bundled pose is the prepared co-crystal input pose; it
was not predicted by SNAP. Five source torsions remain frozen, three polar
hydrogens are prepared inputs, and all 41 inferred bonds are display-only.

## AutoDock-GPU 3CE3 benchmark

The prepared receptor, ligand, and eight AutoGrid maps are redistributed from
the official CCSB Scripps AutoDock-GPU repository at commit
`89fd1c5e6b4639c22e9a2bea4cc805c42347fffb`, path `input/3ce3/derived`.
The benchmark files have no separate per-file license notice, so SNAP applies
the same conservative GPL-2.0-or-later treatment described above and preserves
the verbatim license in `LICENSE-AUTODOCK-GPU-GPL-2.0.txt`.

Pinned prepared-structure hashes:

- receptor PDBQT: `a126b49ef3f125d89e2b14c871dee5734cd1f10290b5aab98ac98526f26f5bfc`
- ligand PDBQT: `33c7b7d176b58b083359f3a9f2e842c1d632a492ee18db1e9f23128673eb118c`

Pinned source-map hashes:

| Channel | SHA-256 |
|---|---|
| A | `d1e573659584d834389788ca1dbfe4e5c9c74c27bdafaa9f8e13e5d6d55a703d` |
| C | `3db9f5b3b20685c09f0db559c4c1daf450e7236b903ea272890fd0238447208e` |
| F | `5bdd6dfd49ea1ef4db2a333d5d6efa519df68f8dc17690d0e5957fe809efcc2e` |
| OA | `6f2eff6f2cc31171e6218c57ef3c7281d41ebfe1a60c6e3da062ce246b84adb0` |
| N | `1bf4514645d11ebe2a5af842409bdcbffd07953073392462405e84034be4e8d8` |
| HD | `b3ea7c21b11e68cc18bcde8c39079962a992bf83ba91887a13eaeabdce3d0845` |
| e | `36219a3845466b6b25a1ce4ce8d11fde7c32b79060e84554e4e160b84f2f749c` |
| d | `dea58af274a624332bb3f81b6b6a438e327f6cdcb1706e77485af64b83690753` |

Published runtime hashes:

| File | Bytes | SHA-256 |
|---|---:|---|
| `3ce3-system.json` | 413,373 | `7f4967f7d616685a4a0e42f9bc5b71720142b80ab6993a21a5520961ad6e014f` |
| `3ce3-autogrid-runtime.json` | 4,713 | `81c6644e7d30a8b61c3d26d64cb6d00da71d881de11486ebd61aca45bb01e014` |
| `3ce3-autogrid.f32` | 2,958,560 | `4ced0694b0cb9252788b1eaf0009183a802305024f598406acab8f3148be3502` |

The Float32 binary is little-endian and channel-major in the order
`A,C,F,OA,N,HD,e,d`; each channel contains 92,455 values in AutoGrid's
x-fastest ordering. The score is the already-weighted, target-specific map
expression `atom-type affinity + q*electrostatics + abs(q)*desolvation` with
trilinear interpolation. It is a rigid-pose local interaction-energy readout,
not measured binding affinity, predictive docking, a drug recommendation, or a
clinical result. Display bonds do not participate in scoring.
