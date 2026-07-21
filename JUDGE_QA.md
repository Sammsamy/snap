# SNAP judge questions

Use these answers as guardrails. Do not memorize every word.

## Is this docking software?

No. SNAP does not search conformations or rank a molecule library. The user supplies the rigid-body search by moving one prepared ligand, and SNAP resamples a prepared AutoGrid field on every move. It is an intuition instrument, not predictive docking.

## Is the score real or just distance from the answer?

It is not a distance-to-pose heuristic. For each ligand atom, SNAP trilinearly samples its AutoDock atom-type channel, the electrostatics channel, and the desolvation channel. It then applies the atom charge terms. The deposited pose and the two disclosed controls all pass through that same path.

## Why should I trust the reveal?

The reveal uses the ligand coordinates deposited with PDB 1STP. SNAP independently scores that pose at `−8.97`. Moving it 0.5 Å weakens the score to `−4.67`, while the 15 degree starting control scores `+4.37`. We do not claim the deposited pose is a global minimum.

## Is biotin a drug?

No. It is a small-molecule benchmark and a canonical molecular-recognition system. The value of the prototype is teaching pose-level intuition that also matters in drug-target reasoning.

## Why only one protein and ligand?

Each system needs offline preparation, atom typing, charge assignment, map generation, provenance, and validation. We chose one auditable benchmark instead of pretending an arbitrary upload was scientifically ready. A second system is the next product milestone.

## Why is the model single-chain?

The official AutoDock-GPU benchmark maps use deposited chain A. A neighboring subunit contributes a contact in the biological tetramer, so SNAP discloses that omission in the interface and README. We did not silently add atoms that the score never sees.

## What did GPT-5.6 and Codex actually do?

They were development collaborators. Codex helped pin public source data, write the reproducible preparation pipeline, implement the scorer and Three.js interaction, generate adversarial tests, and run separate science, licensing, copy, browser, and hostile-judge audits. The session ID is included in the README and submission.

## Why is there no GPT call in the live demo?

The rules require GPT-5.6 and Codex in the build process, not a paid runtime dependency. Keeping the hot loop local lets the score update continuously, makes the demo reliable, and respects the team's zero-credit constraint.

## What is new here?

The underlying scoring science is not new, and interactive molecular systems have prior art. SNAP's contribution is the package: a polished, zero-install browser interaction with continuous prepared-grid scoring, visible physical failure modes, experimental-pose comparison, and an auditable education-first interface.

## What would make this a real learning product?

A guided lesson would ask learners to predict which move improves a pose, then measure pre- and post-lesson performance across several prepared systems. SNAP currently proves the interaction and scoring instrument, not the learning outcome.

## What is the one-sentence pitch?

SNAP lets you move a real small molecule through a real protein pocket and watch a prepared local interaction score, clashes, and candidate contacts respond instantly in your browser.

