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

Individual entry — Fuzlullah Syed

**Public demo**

https://snap-binding.sammsamy.chatgpt.site

**Public repository**

https://github.com/Sammsamy/snap

**Public YouTube video**

`[PUBLIC_YOUTUBE_URL]`

**Codex Session ID**

`019f48c7-345a-70d3-bf51-81bbc847143b`

## Short description

SNAP is a browser instrument for molecular recognition. A user can move and rotate a rigid ligand inside either of two prepared protein pockets while the same client-side AutoGrid scorer updates on every move. The default 1STP streptavidin–biotin system teaches a canonical fit; a selectable 3CE3 c-MET system uses a separate target-specific field for experimental inhibitor 1FN. Steric clashes flash red, plausible candidate contacts appear in cyan, an atom contribution lens shows the largest modeled ligand-atom contributors, and a blind transfer lab reveals that a better local score can coexist with fewer candidate contacts.

## Inspiration

The central idea in pharmacology is easy to say and hard to feel: molecular shape and chemistry determine whether a ligand can sit favorably inside a protein pocket. Students usually meet that idea through static diagrams. We wanted to turn it into a direct, falsifiable interaction that runs in an ordinary browser.

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

The hard part was not drawing molecules. It was making the visual response scientifically inspectable. We had to preserve AutoGrid file order, implement trilinear sampling at grid boundaries, keep out-of-grid states explicit, verify atom-level score deltas against the aggregate at displayed precision, separate scoring from explanatory contact geometry, and prevent false clash labels for donor hydrogen to acceptor contacts.

We also found boundaries during the audit that the interface now states directly. The 1STP benchmark score uses deposited chain A while a neighboring subunit contributes a tetramer contact. The 3CE3 ligand has five frozen torsions and three prepared polar hydrogens; its 41 inferred bonds are display-only. One explanatory clash marker remains at its prepared pose but is separate from the AutoGrid total.

## Accomplishments

- A smooth six degree of freedom molecular interaction in a zero-install browser page
- A real prepared scoring field that reacts continuously rather than a distance-to-answer heuristic
- A dramatic and reproducible `+4.37` to `−8.97` reveal path
- A live pose trace that makes the 13.34 point improvement visible during the reveal
- A color-and-text atom contribution lens whose displayed atom deltas pass a rounding-aware check against the displayed pose delta
- Visible residue identities, distances, clashes, and score components
- A controlled predict–reveal–explain task with an observed-delta receipt and page-memory two-target record
- A target-local transfer result showing score improvement despite fewer candidate-contact markers
- Two selectable prepared targets using one scoring implementation and separate audited fields
- Reproducible assets with checksums and independent validation controls
- Honest product boundaries inside the interface, not hidden in fine print

## What we learned

Scientific interfaces earn trust when users can falsify them. The most valuable design decision was to expose the score components and publish defined control poses. We also learned that a polished explanation layer must be kept separate from the exact scoring path so visual teaching cues do not quietly change the result.

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
- [ ] Record a real voiceover using `VIDEO_SCRIPT.md`.
- [ ] Upload a public YouTube video shorter than three minutes with audio.
- [ ] Replace the remaining YouTube URL placeholder in this file.
- [ ] Include the Codex Session ID in the required submission field.
- [ ] Select the Education category.
- [ ] Complete the `/feedback` step if the submission form requires it.
- [ ] Confirm every team, eligibility, ownership, and prior-work answer is accurate.
- [x] Confirm SNAP is an individual entry and do not name the brother as a teammate.
- [ ] Ask Fuzlullah for final approval immediately before the irreversible Devpost submission.

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
