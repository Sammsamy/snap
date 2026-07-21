# SNAP: 10-minute educator guide

SNAP is a short, browser-based activity for preclinical pharmacology, medicinal chemistry, or molecular biology teaching. Learners commit to a prediction, reveal a prepared reference pose, inspect the evidence, and test whether the same shortcut transfers to a second protein target.

No installation, account, API key, or paid compute is required. Open the [public instrument](https://snap-binding.sammsamy.chatgpt.site) and keep this guide beside it.

## Learning objectives

By the end of the activity, a learner should be able to:

1. Predict how a defined rigid-pose change can affect a target-local AutoGrid score and geometric overlap flags.
2. Explain why candidate-contact count is not the same thing as the score.
3. Distinguish a local pose score from predicted binding affinity, docking search, and clinical evidence.

## Before class

- Use a laptop or desktop with a current browser. A mouse helps but is not required; keyboard controls are available.
- Share the [SNAP link](https://snap-binding.sammsamy.chatgpt.site).
- Ask learners not to open 3CE3 until the transfer prediction is locked. Opening it first intentionally disables the blind path for that page session.
- If the page was already explored, refresh it before beginning.

## The 10-minute activity

### 0:00 to 1:00 | Set the boundary

Say:

> SNAP scores one rigid pose inside one prepared, target-specific field. It does not search for poses or predict affinity. Lower is more favorable only within the selected target.

Point out the current target, score, clash count, candidate contacts, and scientific-boundary panel.

### 1:00 to 3:00 | Make the 1STP prediction

1. Select **1STP · streptavidin · biotin** and press **Start fitting**.
2. Open **Can you read the fit?** and press **Load exact challenge pose** if the controlled baseline is not already confirmed. The disclosed start is about `+4.37`.
3. Require each learner to choose what will happen to the score and clash count.
4. Press **Lock prediction** before revealing the prepared pose.

Prompt: *If the molecule moves from this 15 degree control to the prepared PDB-derived pose, what should change, and why?*

### 3:00 to 5:00 | Reveal and inspect

1. Press **Reveal prepared pose**, wait for the reference to lock, and press **Capture controlled result**.
2. Record the observed change: score `+4.37 → −8.97`; clash markers `4 → 0`.
3. Choose **The readout compares two prepared poses in this local model**, then press **Grade explanation**. This creates the local task receipt required for the blind transfer step.
4. Turn on **Atom contribution lens**.
5. Inspect the three largest ligand-atom contributions and the conservation line showing that the displayed atom deltas sum to the displayed pose delta.

Ask: *Which evidence belongs to the score, and which evidence is a separate geometric explanation?*

Expected distinction:

- AutoGrid map, electrostatic, and desolvation terms make up the score.
- Candidate contacts and clash markers are a separate bounded geometry layer. They help explain a pose but do not change the AutoGrid total.

### 5:00 to 7:00 | Lock a transfer prediction

After the 1STP receipt appears, use the blind transfer lab. Before anyone opens 3CE3, require one prediction:

*When the 3CE3 pose improves, will candidate-contact count rise, stay level, or fall?*

Have learners write one sentence defending their choice. The instrument preserves the first prediction for the page session.

### 7:00 to 9:00 | Test the shortcut on 3CE3

1. Open **3CE3 · c-MET kinase · 1FN**.
2. Press **Start fitting**. The disclosed challenge starts near `+145.80`, with `17` clash markers and `4` candidate contacts.
3. Run the same controlled reveal.
4. Record the result: score `+145.80 → −11.64`; clash markers `17 → 1`; candidate contacts `4 → 3`.

Ask: *The score improved while candidate-contact count fell. What shortcut did this result falsify?*

Expected answer: more candidate contacts do not necessarily produce a more favorable AutoGrid score. The count omits geometry quality and is separate from the target-specific score terms.

### 9:00 to 10:00 | Exit ticket

Have each learner answer these three questions without reopening the explanatory text:

1. What does the prepared-pose reveal establish?
2. Why can the 1STP and 3CE3 scores not be compared as binding strength?
3. Name one important physical effect that SNAP does not model.

## Answer key

1. **What does the reveal establish?** It shows how the same transparent scorer evaluates a disclosed challenge pose and a prepared PDB-derived input pose. It does not prove a global minimum, binding affinity, or biological efficacy.
2. **Why not compare targets?** Each system uses a different target-specific AutoGrid field and prepared model. The numerical scales are not calibrated as cross-target affinity.
3. **What is omitted?** Any one of ligand or receptor flexibility, conformational search, explicit water dynamics, polarization, receptor entropy, or protein motion is acceptable.
4. **Why can contacts fall while the score improves?** Candidate contacts are a separate geometric overlay. The score comes from atom-type map sampling plus charge-weighted electrostatic and desolvation channels.
5. **What does the atom conservation line check?** It checks that displayed per-ligand-atom score changes sum back to the displayed pose-level change within a rounding-aware tolerance. It does not assign energies to receptor residues.

## Optional 20-minute extension

Pair learners. One person manipulates the 1STP ligand while the other predicts the direction of the next score change. Require a reason before every move. After five moves, switch roles. Finish by loading the exact challenge pose and running the controlled reveal so free exploration is compared with a reproducible reference.

Useful prompts:

- Which visual cue changed before the score moved most sharply?
- Can you create fewer clash markers but a less favorable score?
- What additional computation would be needed to call this docking search?
- What experimental or simulation evidence would be needed before making an affinity claim?

## Evaluation protocol for a future pilot

SNAP has not been shown to improve learning. The following is a proposed evaluation, not a result.

1. Give three pre-activity items that test pose reasoning, contact-count reasoning, and model-boundary recognition.
2. Run the scripted 10-minute activity.
3. Repeat parallel items immediately after the activity.
4. Repeat them 24 to 72 hours later and add one unseen prepared-target transfer item.
5. Define the primary outcome before collecting data: change in a rubric-scored explanation, not time on page or number of clicks.
6. Record completion failures and accessibility issues separately from concept scores.
7. Collect only consented, deidentified responses under the instructor's applicable review and privacy process. SNAP does not transmit or persist learner responses; it retains predictions and receipts only in open-page memory until refresh.

Report the sample, missing data, rubric, and all planned outcomes. Do not claim efficacy until the protocol has been run and the results support it.

## Scientific and clinical boundary

SNAP is an educational rigid-pose interaction instrument. It is not docking search, molecular dynamics, affinity prediction, a clinical tool, or a treatment recommendation. No physician review or clinical validation was performed. The full data provenance, model limitations, and reproducibility commands are in the [repository README](https://github.com/Sammsamy/snap#readme).
