# SNAP submission package

This file is working copy. Replace every bracketed placeholder before submission. The deadline is July 21, 2026 at 5:00 PM PDT / 7:00 PM CDT. Keep the free demo available through judging, which ends August 5 at 5:00 PM PDT.

## Recommended Devpost fields

**Project name**

SNAP: The Small-Molecule Binding Instrument

**Submitter type**

Individual

**Country of residence**

United States

**Elevator pitch** (200 characters maximum)

Turn molecular recognition into something you can touch. Move the molecule, break the fit, and watch a transparent local score respond in real time.

**Category / track**

Education

The other official choices are Apps for Your Life, Work & Productivity, and Developer Tools.

**Team**

Individual entry — Fuzlullah Syed

**Public demo**

https://snap-binding.sammsamy.chatgpt.site

**Public repository**

https://github.com/Sammsamy/snap

Enter the same URL again in the required private **Additional Info — repository URL** field.

**Public YouTube video**

`[PUBLIC_YOUTUBE_URL]`

**/feedback Session ID where the majority of your project was worked on**

`019f48c7-345a-70d3-bf51-81bbc847143b`

Verify this exact value by running `/feedback` in the primary Build Week task before submission.

**Built with** (required, 25 tags maximum)

GPT-5.6, Codex, TypeScript, React, Three.js, React Three Fiber, WebGL, Python, AutoGrid, RCSB PDB, Cloudflare Workers

**Judge testing instructions** (optional, visible only to judges and managers)

Open https://snap-binding.sammsamy.chatgpt.site with no login. Run the 1STP Predict → Reveal task, enable the atom contribution lens, then lock a candidate-marker prediction before opening 3CE3. The prepared results are `+4.37 → −8.97` for 1STP and `+145.80 / 17 clashes / 4 markers → −11.64 / 1 clash / 3 markers` for 3CE3. Source, deterministic controls, checksums, and scientific limits are at https://github.com/Sammsamy/snap.

**Final agreement**

Check the required box agreeing to the Official Rules and Devpost Terms only after the final form audit.

## About the project

### Opening

Grab biotin inside a prepared streptavidin pocket. As you translate or rotate it, a client-side AutoGrid score, red steric-overlap flags, and cyan candidate contacts respond on every move.

SNAP turns a static pharmacology diagram into a zero-install, falsifiable browser instrument. Two pinned PDB systems run through one transparent scoring implementation with separate target-specific fields. A Predict → Reveal → Explain task compares a 15 degree challenge pose with the prepared PDB-derived reference. An atom lens verifies that ligand-atom deltas sum to the pose delta. Then a blind c-MET transfer check exposes the counterexample: the score improves while candidate markers fall.

SNAP was conceived and built during OpenAI Build Week; its public commit history begins July 21, 2026.

SNAP is designed for pose-level intuition. It is not docking, affinity prediction, or a clinical tool. No physician review or clinical validation was performed, and SNAP makes no diagnostic, treatment, safety, or efficacy claim.

## Inspiration

One of pharmacology's central abstractions is also one of its least tactile: how a small molecule sits inside a protein pocket. Students are asked to reason about shape complementarity, steric overlap, electrostatics, and hydrogen-bond geometry from flat figures.

As a medical student, I wanted a way to move the molecule, commit to a prediction, and inspect exactly what changed. SNAP asks whether an ordinary browser can turn that abstraction into a manipulable, falsifiable experiment without pretending to perform predictive docking.

## What it does

SNAP loads two authentic prepared benchmarks: 1STP streptavidin–biotin and 3CE3 c-MET kinase with experimental inhibitor 1FN. The user manipulates either ligand in six degrees of freedom. On every move, the browser samples that target's precomputed AutoGrid channels and combines the atom-type, electrostatic, and desolvation terms.

The 1STP path starts from a disclosed 15 degree control at `+4.37` and reveals the prepared input at `−8.97`; a half ångström translation scores `−4.67`. The 3CE3 path starts at `+145.80` with 17 clashes and reveals `−11.64` with one clash; audited translations score `−0.09` and `+3.03`. These controls are visible so a judge can test that the response is not a distance animation or hard-coded success state. Scores are target-specific and are never compared between systems as affinity.

SNAP also renders candidate hydrogen-bond geometry, steric clashes, residue names, contact distances, and individual score terms. Its optional atom lens computes current-minus-challenge deltas for every ligand atom and fails closed unless those atom deltas verify against every scorer-owned term and the total within a rounding-aware tolerance. Its guided task starts only from the exact reset pose, permits only the prepared-reference reveal as the graded action, and produces a target-labelled receipt. After 1STP, a blind first prediction asks whether 3CE3 candidate-marker count will rise, stay level, or fall; viewing 3CE3 first disables that blind path for the page session. The audited result is `+145.80 → −11.64` while markers change `4 → 3`, directly falsifying the shortcut that more candidate contacts must determine a better score. The open page retains the first transfer result and one receipt per system until refresh; it never combines target scores. SNAP does not search poses, predict affinity, prove learning efficacy, or replace docking software.

## How we built it

- React, TypeScript, Three.js, React Three Fiber, and WebGL for the interactive instrument
- Public 1STP and 3CE3 coordinates with pinned prepared AutoDock-GPU benchmark maps
- Exact x-fast trilinear interpolation over eight client-side AutoGrid channels
- A per-ligand-atom contribution lens with same-target guards and rounding-aware score-conservation checks at displayed precision
- A blind, first-attempt-preserving 3CE3 transfer lab built around an audited contact-count counterexample
- A separate bounded interaction pass for explanatory clash and hydrogen bond markers
- Reproducible Python preparation and validation scripts with recorded SHA-256 hashes
- Browser, rendered-shell, deterministic scoring, boundary, and scientific-control tests
- GPT-5.6 in Codex for implementation, data-pipeline work, adversarial review, debugging, test generation, copy review, and release preparation

There is no paid model call in the runtime. GPT-5.6 and Codex were the build tools. The shipped scoring engine runs locally in the browser.

## Challenges

The hard part was not drawing molecules. It was making the visual response scientifically inspectable. I had to preserve AutoGrid file order, implement trilinear sampling at grid boundaries, keep out-of-grid states explicit, verify atom-level score deltas against the aggregate at displayed precision, separate scoring from explanatory contact geometry, and prevent false clash labels for donor hydrogen to acceptor contacts.

The audit also found boundaries that the interface now states directly. The 1STP benchmark score uses deposited chain A while a neighboring subunit contributes a tetramer contact. The 3CE3 ligand has five frozen torsions and three prepared polar hydrogens; its 41 inferred bonds are display-only. One explanatory clash marker remains at its prepared pose but is separate from the AutoGrid total.

## Accomplishments

- Built a zero-install, six-degree-of-freedom molecular instrument where every ligand move updates a client-side AutoGrid score, overlap flags, and candidate contacts.
- Shipped two pinned public benchmarks, 1STP streptavidin–biotin and 3CE3 c-MET–1FN, using one scoring implementation with separately audited target-specific fields.
- Made the result falsifiable. The 1STP challenge reproducibly moves from `+4.37` to `−8.97`, nearby controls score differently, and public tests reproduce the exact score and geometry values.
- Built an atom contribution lens that fails closed unless its displayed ligand-atom deltas conserve back to every scorer-owned term and the total.
- Turned the second target into a prediction rather than a repeated animation. On 3CE3, the score improves from `+145.80` to `−11.64` while candidate markers fall from four to three.
- Published reproducible assets, checksums, source code, explicit model limits, and tests. Runtime scoring remains local and requires no API key or paid model call.

## What we learned

Scientific interfaces earn trust when users can falsify them. The most valuable design decision was to expose the score components and publish defined control poses. I also learned that a polished explanation layer must be kept separate from the exact scoring path so visual teaching cues do not quietly change the result.

## What is next

The next version would run the guided task and blind transfer lab with learners to measure retention and transfer, then add an export path into a full docking workflow. Complete biological assemblies, explicit water handling, and flexible-ligand exploration would require separately prepared and validated models. Those are future extensions, not claims about this release.

## Built with

GPT-5.6, Codex, TypeScript, React, Three.js, React Three Fiber, WebGL, Python, AutoGrid data, RCSB PDB data, and Cloudflare Workers through the Sites build pipeline.

## Judge test path

1. Open `https://snap-binding.sammsamy.chatgpt.site` with no login.
2. Press **Start fitting** and confirm the 15 degree challenge pose scores `+4.37`.
3. Move or rotate biotin and watch the score, clashes, and candidate contacts update.
4. Turn on **Atom contribution lens**, reveal the prepared pose, and confirm the UI reports `Σ atom Δ = pose Δ` while naming the three largest ligand-atom drivers.
5. Load the exact challenge pose, scroll to **Can you read the fit?**, and commit to a prediction before revealing the answer.
6. Run the graded path: locked prediction → prepared-pose reveal → captured observation → evidence-bounded explanation.
7. Confirm the reveal settles at `−8.97` with zero clash markers and produces a local 2-of-2 task receipt for the correct path.
8. Only then scroll to **The heavy-atom pose came from experiment. The score did not.**, compare the disclosed control scores, and inspect the formula.
9. In the blind transfer lab, lock one candidate-marker prediction before opening **3CE3 · c-MET kinase · 1FN**.
10. Press **Start fitting** and confirm `+145.80 / 17 clashes / 4 candidates`, then complete the controlled task and reveal `−11.64 / 1 clash / 3 candidates`.
11. Inspect the target-local counterexample panel and two-target observation record. The 3CE3 score improves while candidate markers fall; no target scores are combined or compared.
12. Switch back to 1STP and confirm its completed page-memory record remains while the active task resets cleanly.
13. Open the repository README for provenance, limitations, validation commands, and the Codex collaboration record.

## Final submission checklist

- [x] License the repository under GPL-2.0-or-later and preserve third-party notices.
- [x] Rerun `python3 scripts/validate_1stp_assets.py`.
- [x] Rerun `npm test`.
- [x] Rerun `npm run lint -- --max-warnings=0`.
- [x] Confirm there are no browser console errors on the deployed build.
- [x] Confirm the public link works with no API key.
- [x] Create the public repository and confirm the README renders correctly.
- [x] Record and visually audit the clean 1280 by 720 screen master.
- [x] Record or synthesize a clear voiceover using `VIDEO_SCRIPT.md`; the official FAQ permits AI-assisted narration.
- [ ] Upload a public YouTube video shorter than three minutes with audio.
- [ ] Replace the remaining YouTube URL placeholder in this file.
- [ ] Include the verified `/feedback` Session ID in the exact required submission field.
- [ ] Select the Education category.
- [ ] Verify that the submitted Session ID is the `/feedback` ID from the primary Build Week thread.
- [ ] Confirm **Individual**, **United States**, required built-with tags, and every eligibility and ownership answer are accurate.
- [x] State that SNAP is new work created during the Build Week window; if that is not true, disclose prior work and dated evidence in About/README.
- [ ] Enter the public repository URL again in the private Additional Info repository field.
- [ ] Paste the condensed judge test path in the optional judge-only testing field.
- [ ] Confirm the video contains no unauthorized third-party trademarks, copyrighted music, or other copyrighted material.
- [ ] Check the required Official Rules and Devpost Terms agreement.
- [x] Confirm SNAP is an individual entry and do not name the brother as a teammate.
- [ ] Ask Fuzlullah for final approval immediately before Devpost submission. A submitted project remains editable only until the deadline; no edits are allowed afterward.

## Claims to avoid

- Do not call biotin a drug.
- Do not call the score a predicted affinity.
- Do not compare 1STP and 3CE3 scores as affinity or binding strength.
- Do not call SNAP predictive docking.
- Do not claim either prepared pose is the global minimum.
- Do not say the complete streptavidin tetramer is scored or displayed.
- Do not call 1FN an approved medicine or imply treatment efficacy.
- Do not describe prepared 1FN polar hydrogens or display-only bonds as experimental coordinates.
- Do not claim GPT-5.6 is called at runtime.
- Do not claim the project is industry-shattering or scientifically unprecedented.

## Official references

- Rules: https://openai.devpost.com/rules
- FAQs: https://openai.devpost.com/details/faqs
- Dates: https://openai.devpost.com/details/dates
