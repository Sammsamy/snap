# SNAP submission package

This file is working copy. Replace every bracketed placeholder before submission.

## Recommended Devpost fields

**Project name**

SNAP

**Tagline**

Touch molecular recognition. Move a real small molecule through a real protein pocket and watch a local AutoGrid score respond instantly.

**Category**

Education

**Team**

`[CONFIRM INDIVIDUAL ENTRY OR ADD BROTHER'S DEVPOST NAME]`

**Public demo**

`[PUBLIC_DEMO_URL]`

**Public repository**

`[PUBLIC_REPOSITORY_URL]`

**Public YouTube video**

`[PUBLIC_YOUTUBE_URL]`

**Codex Session ID**

`019f48c7-345a-70d3-bf51-81bbc847143b`

## Short description

SNAP is a browser instrument for molecular recognition. A user can move and rotate biotin inside a prepared streptavidin pocket while a client-side AutoGrid scorer updates on every move. Steric clashes flash red, plausible hydrogen bond contacts appear in cyan, and the interface names the closest candidate residues and distances. A reveal control moves the ligand to the prepared PDB co-crystal pose so the user can compare their intuition with experiment.

## Inspiration

The central idea in pharmacology is easy to say and hard to feel: molecular shape and chemistry determine whether a ligand can sit favorably inside a protein pocket. Students usually meet that idea through static diagrams. We wanted to turn it into a direct, falsifiable interaction that runs in an ordinary browser.

## What it does

SNAP loads an authentic, prepared 1STP streptavidin and biotin benchmark. The user manipulates biotin in six degrees of freedom. On every move, the browser samples precomputed AutoGrid channels for the ligand atom types and combines the atom type, electrostatic, and desolvation terms.

The current pose starts from a disclosed 15 degree control that scores `+4.37`. The prepared PDB pose scores `−8.97`. A half ångström translation scores `−4.67`. These controls are visible in the product so a judge can test that the response is not a distance animation or a hard-coded success state.

SNAP also renders candidate hydrogen bond geometry, steric clashes, residue names, contact distances, and the individual score terms. It is a rigid, prepared, single-chain intuition model. It does not search poses, predict affinity, or replace docking software.

## How we built it

- React, TypeScript, Three.js, React Three Fiber, and WebGL for the interactive instrument
- Public 1STP coordinates and prepared AutoDock-GPU benchmark maps
- Exact x-fast trilinear interpolation over eight client-side AutoGrid channels
- A separate bounded interaction pass for explanatory clash and hydrogen bond markers
- Reproducible Python preparation and validation scripts with recorded SHA-256 hashes
- Browser, rendered-shell, deterministic scoring, boundary, and scientific-control tests
- GPT-5.6 in Codex for implementation, data-pipeline work, adversarial review, debugging, test generation, copy review, and release preparation

There is no paid model call in the runtime. GPT-5.6 and Codex were the build tools. The shipped scoring engine runs locally in the browser.

## Challenges

The hard part was not drawing molecules. It was making the visual response scientifically inspectable. We had to preserve AutoGrid file order, implement trilinear sampling at grid boundaries, keep out-of-grid states explicit, separate scoring from explanatory contact geometry, and prevent false clash labels for donor hydrogen to acceptor contacts.

We also found a biological limitation during the audit. The official benchmark score uses deposited chain A, while a neighboring subunit contributes a contact in the biological tetramer. We disclose that limitation instead of presenting the model as a complete binding pocket.

## Accomplishments

- A smooth six degree of freedom molecular interaction in a zero-install browser page
- A real prepared scoring field that reacts continuously rather than a distance-to-answer heuristic
- A dramatic and reproducible `+4.37` to `−8.97` reveal path
- A live pose trace that makes the 13.34 point improvement visible during the reveal
- Visible residue identities, distances, clashes, and score components
- Reproducible assets with checksums and independent validation controls
- Honest product boundaries inside the interface, not hidden in fine print

## What we learned

Scientific interfaces earn trust when users can falsify them. The most valuable design decision was to expose the score components and publish defined control poses. We also learned that a polished explanation layer must be kept separate from the exact scoring path so visual teaching cues do not quietly change the result.

## What is next

The next version would add a second prepared benchmark, a guided lesson that measures whether a learner can predict which move will improve a pose, and an export path into a full docking workflow. A complete biological assembly and explicit water handling would require separately prepared and validated maps. Those are future extensions, not claims about this release.

## Built with

GPT-5.6, Codex, TypeScript, React, Three.js, React Three Fiber, WebGL, Python, AutoGrid data, RCSB PDB data, and Cloudflare Workers through the Sites build pipeline.

## Judge test path

1. Open `[PUBLIC_DEMO_URL]` with no login.
2. Press **Start fitting** and confirm the 15 degree challenge pose scores `+4.37`.
3. Move or rotate biotin and watch the score, clashes, and candidate contacts update.
4. Press **Reveal the PDB pose** and confirm the animation settles at `−8.97` with zero clash markers.
5. Scroll to **The pose came from experiment. The score did not.**
6. Compare the three disclosed control scores and inspect the formula.
7. Open the repository README for provenance, limitations, validation commands, and the Codex collaboration record.

## Final submission checklist

- [x] License the repository under GPL-2.0-or-later and preserve third-party notices.
- [ ] Rerun `python3 scripts/validate_1stp_assets.py`.
- [ ] Rerun `npm test`.
- [ ] Rerun `npm run lint -- --max-warnings=0`.
- [ ] Confirm there are no browser console errors on the deployed build.
- [ ] Confirm the public link works in a signed-out browser with no API key.
- [ ] Create the public repository and confirm the README renders correctly.
- [ ] Record a real voiceover using `VIDEO_SCRIPT.md`.
- [ ] Upload a public YouTube video shorter than three minutes with audio.
- [ ] Replace the three URL placeholders in this file.
- [ ] Include the Codex Session ID in the required submission field.
- [ ] Select the Education category.
- [ ] Complete the `/feedback` step if the submission form requires it.
- [ ] Confirm every team, eligibility, ownership, and prior-work answer is accurate.
- [ ] Confirm whether SNAP is an individual entry or officially add the brother before naming him in the submission.
- [ ] Ask Fuzlullah for final approval immediately before the irreversible Devpost submission.

## Claims to avoid

- Do not call biotin a drug.
- Do not call the score a predicted affinity.
- Do not call SNAP predictive docking.
- Do not claim the prepared PDB pose is the global minimum.
- Do not say the complete streptavidin tetramer is scored or displayed.
- Do not claim GPT-5.6 is called at runtime.
- Do not claim the project is industry-shattering or scientifically unprecedented.

## Official references

- Rules: https://openai.devpost.com/rules
- FAQs: https://openai.devpost.com/details/faqs
- Dates: https://openai.devpost.com/details/dates
