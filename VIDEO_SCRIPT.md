# SNAP demo script

Target length: 100 to 115 seconds. Keep the final upload below three minutes.

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

### 0:30 to 0:50

**Screen:** Drag or rotate the molecule once. Let the score and contact labels update. Then press **Reveal the PDB pose**.

**Say:**

“I can move the molecule in six degrees of freedom, and every move resamples the prepared AutoGrid field here in the browser. When I reveal the deposited pose, the score is not hard coded. The molecule moves to the public coordinates and SNAP independently scores that position.”

### 0:50 to 1:05

**Screen:** Hold on the revealed pose. Show `−8.97`, zero clashes, the contact residue names, and the score components.

**Say:**

“The result is minus 8.97, with no clash markers. The live trace shows a 13.34 point improvement. The interface names the candidate contact residues and their distances, and exposes the atom type, electrostatic, and desolvation terms instead of hiding them behind one number.”

### 1:05 to 1:22

**Screen:** Scroll to the proof section. Point to the three control scores and the equation.

**Say:**

“Here is the falsifiable check. The prepared PDB pose scores minus 8.97. Moving it half an ångström weakens the score to minus 4.67. Rotating it fifteen degrees makes it unfavorable at plus 4.37. The same scorer produces all three results.”

### 1:22 to 1:40

**Screen:** Show the README section named “How GPT-5.6 and Codex were used,” then briefly show the scoring tests or terminal result.

**Say:**

“We built SNAP with GPT-5.6 in Codex. It helped us prepare and audit the public molecular assets, implement the trilinear scoring path, test the interaction geometry, and attack our own claims. The runtime itself needs no paid model call. The scoring stays local and keeps working after the page loads.”

### 1:40 to 1:52

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
