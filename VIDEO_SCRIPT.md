# SNAP demo script

Target length: 115 to 130 seconds. Keep the final upload below three minutes.

Record the browser at 1280 by 720 or larger. Use your real voice. A brief camera introduction is optional, but the working product should occupy most of the video.

## Before recording

1. Load the public SNAP link in a fresh browser window.
2. Confirm the opening score is `+4.37`.
3. Confirm the page says `15° challenge pose` after you press **Start fitting**.
4. Turn sound on.
5. Keep the mouse movements slow enough to read the dial.
6. Have the repository README and the proof section ready in separate tabs.

## Script and screen actions

### 0:00 to 0:10

**Screen:** Show the opening card, then press **Start fitting**.

**Say:**

“Most of pharmacology is taught with one sentence: a small molecule fits a protein pocket. But students almost never get to touch that idea. This is SNAP.”

### 0:10 to 0:30

**Screen:** Let the 15 degree challenge pose fill the screen. Point at the `+4.37` score, red clash markers, and candidate contact list.

**Say:**

“This is biotin inside a real streptavidin structure from PDB 1STP. It starts only fifteen degrees away from the prepared experimental pose. That small mistake is enough to push the local score to plus 4.37, create four steric clashes, and change which residues can make plausible hydrogen bond contacts.”

### 0:30 to 0:42

**Screen:** Drag or rotate the molecule once. Let the score and contact labels update, then press **Load exact challenge pose**. Do not reveal the answer yet.

**Say:**

“I can move the molecule in six degrees of freedom, and every move resamples the prepared AutoGrid field here in the browser. But exploration alone does not show whether I understand the readout, so I reset to the exact challenge pose before committing to a prediction.”

### 0:42 to 1:10

**Screen:** Scroll to **Can you read the fit?** Choose **A lower score, with fewer clashes**, press **Lock prediction**, then press **Reveal the PDB pose**. Hold on the revealed pose and press **Capture observation**.

**Say:**

“Before seeing the answer, I predict that the deposited pose will lower the score and remove clashes. SNAP now forces the controlled reset-to-reference comparison. The result is minus 8.97 with zero clashes, a 13.34 point improvement. The observation is graded against what actually happened, not a hard-coded success screen.”

### 1:10 to 1:25

**Screen:** Choose **The readout compares two prepared poses in this local model**, submit it, and show the 2 of 2 local receipt.

**Say:**

“I then have to explain what the result means. This is a comparison of two prepared poses in a local model, not clinical affinity or drug discovery. The receipt records both reasoning checks locally and makes no claim that one task proves learning.”

### 1:25 to 1:43

**Screen:** Scroll to the proof section. Point to the three control scores and the equation.

**Say:**

“Here is the falsifiable check. The prepared PDB pose scores minus 8.97. Moving it half an ångström weakens the score to minus 4.67. Rotating it fifteen degrees makes it unfavorable at plus 4.37. The same scorer produces all three results, and the terms are exposed instead of hidden behind one number.”

### 1:43 to 2:01

**Screen:** Show the README section named “How GPT-5.6 and Codex were used,” then briefly show the scoring tests or terminal result.

**Say:**

“We built SNAP with GPT-5.6 in Codex. It helped us prepare and audit the public molecular assets, implement the trilinear scoring path, test the interaction geometry, and attack our own claims. The runtime itself needs no paid model call. The scoring stays local and keeps working after the page loads.”

### 2:01 to 2:13

**Screen:** Return to the glowing revealed complex and SNAP wordmark.

**Say:**

“SNAP is one rigid, prepared, single-chain teaching model. It does not predict affinity and it is not docking software. It is a free browser instrument for building molecular intuition by moving, breaking, and comparing a pose with experiment.”

End on the SNAP wordmark for two seconds.

## Recording notes

- Say “small molecule,” not “drug.” Biotin is the benchmark ligand.
- Say “candidate contact” or “plausible hydrogen bond geometry,” not “confirmed bond.”
- Say “local prepared AutoGrid score,” not “binding affinity.”
- Do not claim the PDB pose is the global optimum.
- Do not claim this is a complete tetramer model. The displayed and scored model is chain A.
- Keep the score dial visible during the reveal.
- If a drag goes badly, restart the take. The clean proof is more important than improvisation.
