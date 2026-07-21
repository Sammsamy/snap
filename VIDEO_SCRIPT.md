# SNAP demo script

Target length: 150 to 165 seconds. Keep the final upload below three minutes.

Record the browser at 1280 by 720 or larger. Use your real voice. A brief camera introduction is optional, but the working product should occupy most of the video.

## Before recording

1. Load the public SNAP link in a fresh browser window.
2. Confirm the opening score is `+4.37`.
3. Confirm the page says `15° challenge pose` after you press **Start fitting**.
4. Confirm **Atom contribution lens** reports `Σ atom Δ −13.34 = pose Δ −13.34` after the 1STP reveal.
5. Turn sound on.
6. Keep the mouse movements slow enough to read the dial.
7. Use a clean jump cut while completing the repeated 3CE3 task so the final two-target record remains readable for at least five seconds.
8. Have the repository README and the proof section ready in separate tabs.

## Script and screen actions

### 0:00 to 0:10

**Screen:** Show the opening card, then press **Start fitting**.

**Say:**

“Most of pharmacology is taught with one sentence: a small molecule fits a protein pocket. But students almost never get to touch that idea. This is SNAP.”

### 0:10 to 0:30

**Screen:** Let the 15 degree challenge pose fill the screen. Point at the `+4.37` score, red clash markers, and candidate contact list.

**Say:**

“This is biotin in real streptavidin from PDB 1STP. It starts fifteen degrees from the prepared pose. That small error pushes the local score to plus 4.37, creates four clashes, and changes the candidate contacts.”

### 0:30 to 0:43

**Screen:** Drag or rotate the molecule once. Let the score and contact labels update, then scroll to **Can you read the fit?** and press **Load exact challenge pose**. Do not reveal the answer yet.

**Say:**

“I can move the molecule in six degrees of freedom, and every move resamples this AutoGrid field in the browser. To test whether I understand the readout, I reset to the exact challenge pose before predicting.”

### 0:43 to 1:05

**Screen:** Choose **A lower score, with fewer clashes**, press **Lock prediction**, then press **Reveal prepared pose**. Hold on the revealed pose and press **Capture controlled result**.

**Say:**

“Before seeing the answer, I predict that the prepared pose will lower the score and remove clashes. SNAP forces the exact reset-to-reference comparison. The result is minus 8.97 with zero clashes, a 13.34 point improvement, graded against what happened rather than a success animation.”

### 1:05 to 1:20

**Screen:** Turn on **Atom contribution lens**. Hold on the colored ligand, the three atom rows, and `Σ atom Δ −13.34 = pose Δ −13.34`.

**Say:**

“Now I can ask which ligand atoms contributed most to that change. The lens subtracts each atom’s challenge contribution from its current contribution. O3 is the largest modeled contributor, and this rounding-aware line verifies the sum at displayed precision. These are not invented residue energies or affinity.”

### 1:20 to 1:34

**Screen:** Choose **The readout compares two prepared poses in this local model**, submit it, and briefly show the local receipt and the new `1 of 2 targets observed` record.

**Say:**

“I then explain what the result means. This compares prepared poses in a local model, not clinical affinity or drug discovery. The page keeps one receipt per target, but that is not a mastery score or evidence that learning occurred.”

### 1:34 to 1:47

**Screen:** Scroll to the proof section. Point to the three control scores and the equation.

**Say:**

“Here is another check. The prepared input scores minus 8.97. Moving it half an ångström gives minus 4.67. Rotating it fifteen degrees gives plus 4.37. The same scorer produces each control, with every term exposed.”

### 1:47 to 2:15

**Screen:** Use **Continue with 3CE3**, press **Start fitting**, and show `+145.80 / 17 clashes / 4 candidates`. Use a clean jump cut through the same controlled task, reveal `−11.64 / 1 clash / 3 candidates`, then hold on the complete `2 of 2 targets observed` record for at least five seconds.

**Say:**

“This is not a one-molecule trick. PDB 3CE3 loads a separate c-MET field through the same scorer. Experimental inhibitor 1FN moves from plus 145.80 to minus 11.64, with five torsions frozen. After repeating the task, both receipts remain on this page. Their scores are never combined or compared as affinity.”

### 2:15 to 2:34

**Screen:** Show the README section named “How GPT-5.6 and Codex were used,” then briefly show the scoring tests or terminal result.

**Say:**

“We built SNAP with GPT-5.6 in Codex. It helped prepare and audit the public molecular assets, implement the trilinear scorer and atom conservation checks, test the geometry, and attack our claims. The runtime needs no paid model call. Scoring stays local after the assets load.”

### 2:34 to 2:48

**Screen:** Return to the glowing revealed complex and SNAP wordmark.

**Say:**

“SNAP is two rigid teaching systems behind one transparent engine. It does not predict affinity, and it is not docking software. It is a free browser instrument for building molecular intuition by moving a pose, breaking it, predicting the result, and checking it against experiment.”

End on the SNAP wordmark for two seconds.

## Recording notes

- Say “small molecule,” not “drug.” Biotin is the benchmark ligand.
- Say “candidate contact” or “plausible hydrogen bond geometry,” not “confirmed bond.”
- Say “local prepared AutoGrid score,” not “binding affinity.”
- Do not claim either prepared pose is the global optimum.
- Do not claim this is a complete tetramer model. The displayed and scored model is chain A.
- Call 1FN an experimental inhibitor, never an approved medicine.
- Say the two scores are target-specific and cannot be compared as affinity.
- Keep the score dial visible during the reveal.
- Keep the atom lens conservation line visible long enough to read.
- Keep the final two-target observation record visible for at least five seconds.
- If a drag goes badly, restart the take. The clean proof is more important than improvisation.
