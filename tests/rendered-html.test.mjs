import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the SNAP instrument shell without placeholder claims", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>SNAP — The small molecule binding instrument<\/title>/i,
  );
  assert.match(html, /Loading PDB 1STP and its prepared AutoGrid field/i);
  assert.match(html, /Streptavidin · biotin/i);
  assert.match(html, /c-MET kinase · 1FN/i);
  assert.match(html, /2 systems · 2 target-specific fields/i);
  assert.match(html, /Compare poses within one target/i);
  assert.match(html, /score runs in this browser/i);
  assert.match(html, /Live pose trace/i);
  assert.match(html, /Rigid single-chain model/i);
  assert.match(html, /not drug discovery predictions/i);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/i);
  assert.doesNotMatch(html, /binding affinity prediction|predictive docking/i);
});

test("ships authentic prepared assets and the exact local scoring path", async () => {
  const [
    systemText,
    gridText,
    runtimeGridText,
    scoringSource,
    experienceSource,
    stageSource,
    packageText,
    binaryStats,
    thirdPartyText,
  ] = await Promise.all([
    readFile(new URL("../public/data/1stp-biotin.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/1stp-autogrid.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/1stp-autogrid-runtime.json", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/scoring.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SnapExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MolecularStage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    stat(new URL("../public/data/1stp-autogrid.f32", import.meta.url)),
    readFile(new URL("../public/data/THIRD_PARTY_DATA.md", import.meta.url), "utf8"),
  ]);

  const system = JSON.parse(systemText);
  const grid = JSON.parse(gridText).autoGrid;
  const runtimeGrid = JSON.parse(runtimeGridText).autoGrid;
  const packageJson = JSON.parse(packageText);

  assert.equal(system.system.entryId, "1STP");
  assert.equal(system.receptor.atoms.length, 1116);
  assert.equal(system.ligand.atoms.length, 18);
  assert.equal(system.scoring.referencePoseScore, -8.974162);
  assert.match(system.system.modelScopeLabel, /single-chain/i);
  assert.ok(system.system.limitations.some((item) => /not predictive docking/i.test(item)));

  assert.deepEqual(grid.dimensions, { x: 25, y: 23, z: 33 });
  assert.equal(grid.binary.valuesPerChannel, 18975);
  assert.equal(grid.validation.referenceCrystalPose.score, -8.974162);
  assert.equal(binaryStats.size, 607200);
  assert.equal(runtimeGrid.maps, undefined);
  assert.equal(runtimeGrid.binary.url, "/data/1stp-autogrid.f32");
  assert.equal(system.scoring.autoGridManifest, "/data/1stp-autogrid-runtime.json");

  assert.match(scoringSource, /affinity\[type_i\]\(r_i\)/);
  assert.match(scoringSource, /scorePoseWithAutoGrid/);
  assert.match(scoringSource, /coordinate\.x >= maxX/);
  assert.match(experienceSource, /scorePoseWithAutoGrid/);
  assert.match(experienceSource, /scoredPose\.outsideGridAtoms > 0/);
  assert.match(experienceSource, /Not a predicted binding affinity/);
  assert.match(experienceSource, /focusMolecularStage/);
  assert.match(experienceSource, /prefers-reduced-motion: reduce/);
  assert.match(stageSource, /pointer-translate/);
  assert.match(stageSource, /keyboard-rotate/);
  assert.match(stageSource, /Drag mode:/);
  assert.match(stageSource, /prefers-reduced-motion/);

  assert.match(packageJson.scripts["test:scoring"], /scoring\.test\.ts/);
  assert.equal(packageJson.dependencies?.openai, undefined);
  assert.match(thirdPartyText, /AutoDock-GPU/i);
  assert.match(thirdPartyText, /GPL-2\.0-or-later/i);
});
