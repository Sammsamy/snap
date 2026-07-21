# SNAP

**Grab a real small molecule, fit it into a prepared protein pocket, and watch an authentic AutoGrid4 pose score respond in real time.**

SNAP turns a static molecular-recognition diagram into a falsifiable browser instrument. The first system is the prepared biotin–streptavidin example from PDB 1STP and the official AutoDock-GPU benchmark. Drag biotin through the pocket, rotate it, inspect candidate hydrogen-bond contacts and steric overlaps, then reveal the prepared PDB co-crystal pose.

The score runs entirely in the browser. There is no API call, server calculation, account, paid credit, or model in the interaction loop.

**[Open the public instrument](https://snap-binding.sammsamy.chatgpt.site)** · **[Inspect the public repository](https://github.com/Sammsamy/snap)**

## What the demo proves

SNAP is not a distance-to-answer trick. Each ligand atom samples the official target-specific AutoGrid maps with x-fast trilinear interpolation:

```text
atom-type affinity map + q × electrostatics map + |q| × desolvation map
```

Lower scores are more favorable for this fixed prepared system.

| Audited pose | AutoGrid4 local pose score |
| --- | ---: |
| Prepared PDB co-crystal pose | **−8.974** |
| Translate +0.5 Å on x | −4.674 |
| Rotate 15° around z | +4.371 |
| Rotate 20° around z | +3.536 |

The prepared PDB pose beats these disclosed controls and sits in a favorable local basin under this model. That does **not** prove a global optimum and does not predict biological affinity.

## Five-second judge path

1. Press **Start fitting**.
2. See the disclosed 15° challenge pose begin at approximately +4.37 with visible clash markers.
3. Drag the bright biotin molecule or use the arrow keys, then watch the score, live pose trace, candidate contact residues, distances, and clashes update.
4. Press **Reveal the PDB pose**.
5. See the molecule converge on the public co-crystal coordinates and the score settle at approximately −8.97.
6. Run the controlled **Predict → Reveal → Explain** task and receive a local reasoning receipt based on the observed deltas.

Keyboard controls are built in: arrows translate, Page Up/Page Down move in depth, Shift + arrows rotate, and Q/E roll. The stage respects reduced-motion preferences.

The learning task captures only one deterministic comparison: the exact 15° reset pose to the locked PDB reference pose. It grades the prediction against the score and clash changes that actually occurred. The receipt stays in memory for that browser session and is explicitly not evidence of learning efficacy or clinical validation.

## Scientific boundary

SNAP is a rigid-pose interaction instrument for intuition and education. It is not a docking search, affinity predictor, molecular-dynamics engine, or clinical tool.

- Receptor and ligand are rigid.
- There is no conformational search, minimization, or torsional optimization.
- Protonation, AutoDock atom types, and Gasteiger partial charges are prepared inputs.
- The benchmark preparation uses a deprotonated biotin carboxylate.
- The maps use implicit solvent and omit explicit water dynamics, polarization, receptor entropy, and protein motion.
- The official AutoDock-GPU benchmark maps contain deposited chain A only. The biological tetramer and its intersubunit contacts are omitted from the score.
- The neighboring tetramer-contact Trp120 residue and nearby crystallographic waters are documented as unscored context, not included in the displayed or scored atom model.
- Candidate H-bonds and clashes come from a separate bounded geometric explanation layer. They do not alter the authentic AutoGrid total.
- If any ligand atom leaves the prepared grid, the UI shows an out-of-grid state rather than presenting the guard penalty as physical energy.

Biotin is a small molecule and canonical binding model, not a drug. SNAP is a foundation for teaching the same pose-level concepts used when reasoning about drug–target systems.

## Architecture

```text
Pinned public structure + official benchmark maps
                    ↓
       reproducible offline preparation
                    ↓
 centered atoms + 8-channel Float32 grid
                    ↓
      browser trilinear scorer (exact total)
                    ↓
 bounded pair geometry (visual explanation only)
                    ↓
 Three.js 6-DOF stage + score dial + PDB reveal
```

Important files:

- `app/lib/scoring.ts` — rigid transforms, exact AutoGrid interpolation, and bounded explanation geometry.
- `app/components/MolecularStage.tsx` — instanced molecular rendering, drag/rotate controls, contacts, pocket glow, and reduced-motion support.
- `app/components/SnapExperience.tsx` — asset hydration, scoring policy, reveal animation, audio cue, and explanatory UI.
- `scripts/prepare_1stp.py` — reproducible public-data preparation.
- `scripts/validate_1stp_assets.py` — hashes, coordinate checks, binary/JSON parity, and reference/decoy score checks.
- `VIDEO_SCRIPT.md`, `SUBMISSION.md`, and `JUDGE_QA.md` — the recording script, Devpost copy, release checklist, and hostile-question guardrails.
- `public/data/1stp-biotin.json` — centered prepared atoms, reference pose, provenance, scope, and limitations.
- `public/data/1stp-autogrid.f32` — compact 8-channel Float32 grid used at runtime.
- `public/data/1stp-autogrid-runtime.json` — compact runtime metadata for the binary grid, without duplicated map values.
- `public/data/1stp-autogrid.json` — inspectable map values, per-channel hashes, and validation record.

## Run locally

Prerequisite: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Run every current verification:

```bash
python3 scripts/validate_1stp_assets.py
npm test
npm run lint -- --max-warnings=0
```

`npm test` runs the deterministic scoring tests, produces a release build, verifies the server-rendered product shell, and audits the shipped scientific contracts.

## GPT-5.6 and Codex collaboration

SNAP was built in Codex with GPT-5.6. The model was used during development, not as a paid runtime dependency.

Codex helped the team:

- audit the Build Week rules and remove an unnecessary runtime API plan;
- find and pin the official AutoDock-GPU 1STP benchmark instead of inventing molecular parameters;
- write the reproducible preparation and independent validator;
- implement and test x-fast trilinear map scoring and quaternion pose transforms;
- build the Three.js interaction stage, keyboard access, reduced-motion behavior, and responsive interface;
- run separate science, licensing, hostile-judge, copy, and live-browser audits;
- catch the single-chain biological-assembly limitation, an interpolation-boundary mismatch, and false clash labels before release.

Codex session ID for the Build Week collaboration:

```text
019f48c7-345a-70d3-bf51-81bbc847143b
```

## Data, provenance, and licensing

SNAP is released as a whole under **GPL-2.0-or-later**. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

- RCSB PDB coordinate data are provided under the [RCSB PDB usage policy / CC0](https://www.rcsb.org/pages/usage-policy).
- AutoDock-GPU benchmark PDBQT/map assets are pinned to commit `89fd1c5e6b4639c22e9a2bea4cc805c42347fffb` and conservatively redistributed under the upstream repository's GPL-2.0-or-later terms.
- Exact source paths, SHA-256 hashes, copyright/trademark notices, no-endorsement language, and the upstream license are in [`public/data/THIRD_PARTY_DATA.md`](public/data/THIRD_PARTY_DATA.md).
- SNAP is independent and is not affiliated with or endorsed by the AutoDock authors, TU Darmstadt, CCSB Scripps, the Scripps Research Institute, or RCSB PDB.

## Primary references

- Morris, G. M., et al. AutoDock4 and AutoDockTools4. *Journal of Computational Chemistry* (2009). [DOI](https://doi.org/10.1002/jcc.21256)
- Huey, R., et al. A semiempirical free energy force field with charge-based desolvation. *Journal of Computational Chemistry* (2007). [DOI](https://doi.org/10.1002/jcc.20634)
- [AutoDock-GPU](https://github.com/ccsb-scripps/AutoDock-GPU)
- [RCSB PDB 1STP](https://www.rcsb.org/structure/1STP)

## Current release state

The implementation, local verification, public repository, and public deployment are complete. Video recording/upload, external review, and final Devpost submission remain separate release gates and have not been represented as complete here.
