# SNAP judge questions

Use these answers as guardrails. Do not memorize every word.

## Is this docking software?

No. SNAP does not search conformations or rank a molecule library. The user supplies the rigid-body search by moving one prepared ligand, and SNAP resamples a prepared AutoGrid field on every move. It is an intuition instrument, not predictive docking.

## Is the score real or just distance from the answer?

It is not a distance-to-pose heuristic. For each ligand atom, SNAP trilinearly samples its AutoDock atom-type channel, the electrostatics channel, and the desolvation channel. It then applies the atom charge terms. Both targets and every disclosed control pass through that same implementation with separate target-specific maps.

## Why should I trust the reveal?

The default reveal uses the PDB-derived prepared 1STP input and scores it independently at `−8.97`. Moving it 0.5 Å gives `−4.67`, while the 15 degree control gives `+4.37`. The separate 3CE3 field gives `−11.64` for its prepared input, `−0.09` and `+3.03` for translations, and `+145.80` for the 15 degree control. We do not claim either pose is a global minimum.

## Is biotin a drug?

No. It is a small-molecule benchmark and a canonical molecular-recognition system. The value of the prototype is teaching pose-level intuition that also matters in drug-target reasoning.

## Is 1FN an approved drug?

No. It is an experimental inhibitor in the 3CE3 co-crystal. SNAP does not evaluate efficacy, safety, or treatment use.

## Why only two prepared systems instead of arbitrary uploads?

Each target needs offline preparation, atom typing, charge assignment, target-specific maps, provenance, and validation. We ship two independently audited benchmarks to prove the engine generalizes without pretending an arbitrary upload is scientifically ready.

## Can I compare −8.97 for 1STP with −11.64 for 3CE3?

No. They come from different target-specific fields and prepared systems. The scores compare poses within one target only; they are not calibrated affinities or cross-target binding strengths.

## Why does one clash marker remain at the prepared 3CE3 pose?

The clash overlay is a bounded explanatory geometry heuristic, separate from the authentic AutoGrid total. One marker remaining does not mean the experimental heavy-atom pose is wrong. Three 1FN polar hydrogens are prepared, five source torsions stay frozen, and its 41 inferred bonds are display-only.

## Why is the model single-chain?

The official AutoDock-GPU benchmark maps use deposited chain A. A neighboring subunit contributes a contact in the biological tetramer, so SNAP discloses that omission in the interface and README. We did not silently add atoms that the score never sees.

## What did GPT-5.6 and Codex actually do?

They were development collaborators. Codex helped pin public source data, write the reproducible preparation pipeline, implement the scorer and Three.js interaction, generate adversarial tests, and run separate science, licensing, copy, browser, and hostile-judge audits. The session ID is included in the README and submission.

## Why is there no GPT call in the live demo?

The rules require GPT-5.6 and Codex in the build process, not a paid runtime dependency. Keeping the hot loop local lets the score update continuously, makes the demo reliable, and respects the team's zero-credit constraint.

## Does switching targets require a server calculation?

No. An uncached switch downloads that target's static JSON and Float32 grid. Once those assets load, every move and score runs locally in the browser with no calculation API.

## What is new here?

The underlying scoring science is not new, and interactive molecular systems have prior art. SNAP's contribution is the package: a polished, zero-install browser interaction with continuous prepared-grid scoring, visible physical failure modes, controlled reasoning tasks, and two auditable target-specific systems behind one interface.

## What would make this a real learning product?

SNAP now asks learners to predict a controlled contrast, observe it, and explain only what it supports on either target. A real learning product would measure pre/post performance and transfer across learners and systems. This release proves the task and scoring instrument, not learning efficacy.

## What is the one-sentence pitch?

SNAP lets you move a real small molecule through a real protein pocket and watch a prepared local interaction score, clashes, and candidate contacts respond instantly in your browser.
