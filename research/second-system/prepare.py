#!/usr/bin/env python3
"""Fetch the pinned AutoDock-GPU 3CE3 benchmark and verify every byte.

This script intentionally writes only inside research/second-system. The bundle
is a release candidate, not part of SNAP's public runtime assets.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


COMMIT = "89fd1c5e6b4639c22e9a2bea4cc805c42347fffb"
REPOSITORY = "https://github.com/ccsb-scripps/AutoDock-GPU"
RAW_ROOT = f"https://raw.githubusercontent.com/ccsb-scripps/AutoDock-GPU/{COMMIT}"
HERE = Path(__file__).resolve().parent
RAW_DIR = HERE / "raw"

# Destination -> (repository path, SHA-256)
FILES: dict[str, tuple[str, str]] = {
    "UPSTREAM_LICENSE_GPL-2.0.txt": (
        "LICENSE",
        "4efdbc005c9b557547d62fa9b9885a6837aca508414bcc7b4b93842ce31b6f66",
    ),
    "raw/3CE3.pdb": (
        "input/3ce3/3CE3.pdb",
        "90dfa6c0c8bb525da7778940bdae2b7fda7016f2932ba6487eb334512ec4ade8",
    ),
    "raw/3ce3.gpf": (
        "input/3ce3/derived/3ce3.gpf",
        "b7b6065af41f00bde42004fd615a3a9a80602db20d7c290cca7766ab18c3df96",
    ),
    "raw/3ce3.dpf": (
        "input/3ce3/derived/3ce3.dpf",
        "237b13566477ea73be504e091c05a37cb1f62ecabe59904415a639a5269b9a5c",
    ),
    "raw/3ce3_protein.maps.fld": (
        "input/3ce3/derived/3ce3_protein.maps.fld",
        "0babf07a002349393a71f2a42f1e8a961f61296287f349b9e445747d1e90e008",
    ),
    "raw/3ce3_ligand.pdbqt": (
        "input/3ce3/derived/3ce3_ligand.pdbqt",
        "33c7b7d176b58b083359f3a9f2e842c1d632a492ee18db1e9f23128673eb118c",
    ),
    "raw/3ce3_protein.pdbqt": (
        "input/3ce3/derived/3ce3_protein.pdbqt",
        "a126b49ef3f125d89e2b14c871dee5734cd1f10290b5aab98ac98526f26f5bfc",
    ),
    "raw/3ce3_protein.A.map": (
        "input/3ce3/derived/3ce3_protein.A.map",
        "d1e573659584d834389788ca1dbfe4e5c9c74c27bdafaa9f8e13e5d6d55a703d",
    ),
    "raw/3ce3_protein.C.map": (
        "input/3ce3/derived/3ce3_protein.C.map",
        "3db9f5b3b20685c09f0db559c4c1daf450e7236b903ea272890fd0238447208e",
    ),
    "raw/3ce3_protein.F.map": (
        "input/3ce3/derived/3ce3_protein.F.map",
        "5bdd6dfd49ea1ef4db2a333d5d6efa519df68f8dc17690d0e5957fe809efcc2e",
    ),
    "raw/3ce3_protein.HD.map": (
        "input/3ce3/derived/3ce3_protein.HD.map",
        "b3ea7c21b11e68cc18bcde8c39079962a992bf83ba91887a13eaeabdce3d0845",
    ),
    "raw/3ce3_protein.N.map": (
        "input/3ce3/derived/3ce3_protein.N.map",
        "1bf4514645d11ebe2a5af842409bdcbffd07953073392462405e84034be4e8d8",
    ),
    "raw/3ce3_protein.OA.map": (
        "input/3ce3/derived/3ce3_protein.OA.map",
        "6f2eff6f2cc31171e6218c57ef3c7281d41ebfe1a60c6e3da062ce246b84adb0",
    ),
    "raw/3ce3_protein.e.map": (
        "input/3ce3/derived/3ce3_protein.e.map",
        "36219a3845466b6b25a1ce4ce8d11fde7c32b79060e84554e4e160b84f2f749c",
    ),
    "raw/3ce3_protein.d.map": (
        "input/3ce3/derived/3ce3_protein.d.map",
        "dea58af274a624332bb3f81b6b6a438e327f6cdcb1706e77485af64b83690753",
    ),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "SNAP-second-system-audit/1.0"})
    with urlopen(request, timeout=45) as response:
        return response.read()


def obtain(destination: Path, source_path: str, expected_hash: str) -> bytes:
    if destination.exists():
        existing = destination.read_bytes()
        if sha256(existing) == expected_hash:
            return existing

    data = fetch(f"{RAW_ROOT}/{source_path}")
    actual_hash = sha256(data)
    if actual_hash != expected_hash:
        raise RuntimeError(
            f"SHA-256 mismatch for {source_path}: expected {expected_hash}, got {actual_hash}"
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_bytes(data)
    os.replace(temporary, destination)
    return data


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    artifacts = []
    for relative_destination, (source_path, expected_hash) in FILES.items():
        destination = HERE / relative_destination
        data = obtain(destination, source_path, expected_hash)
        artifacts.append(
            {
                "path": relative_destination,
                "bytes": len(data),
                "sha256": expected_hash,
                "upstream_path": source_path,
                "source_url": f"{RAW_ROOT}/{source_path}",
            }
        )

    manifest = {
        "schema_version": 1,
        "prepared_at": datetime.now(timezone.utc).isoformat(),
        "system": {
            "pdb_id": "3CE3",
            "target": "human c-MET (hepatocyte growth factor receptor) kinase domain",
            "ligand_comp_id": "1FN",
            "ligand_description": (
                "experimental pyrrolopyridinepyridone-based c-MET inhibitor; "
                "not represented as an approved drug"
            ),
            "rcsb_entry": "https://www.rcsb.org/structure/3CE3",
            "rcsb_chemcomp": "https://www.rcsb.org/ligand/1FN",
        },
        "upstream": {
            "repository": REPOSITORY,
            "commit": COMMIT,
            "commit_url": f"{REPOSITORY}/commit/{COMMIT}",
        },
        "license": {
            "conservative_treatment": "GPL-2.0",
            "basis": (
                "Files are copied verbatim from a GPL-2.0-licensed upstream repository; "
                "no separate per-file license notice was found. Preserve the included license."
            ),
            "license_copy": "UPSTREAM_LICENSE_GPL-2.0.txt",
        },
        "grid": {
            "spacing_angstrom": 0.375,
            "nelements": [40, 54, 40],
            "point_dimensions": [41, 55, 41],
            "center": [20.402, 18.013, 56.855],
            "affinity_channels": ["A", "C", "F", "OA", "N", "HD"],
            "electrostatics_channel": "e",
            "desolvation_channel": "d",
            "total_channels": 8,
        },
        "artifacts": artifacts,
        "runtime_payload_bytes": sum(
            item["bytes"]
            for item in artifacts
            if item["path"].startswith("raw/3ce3_protein")
            or item["path"] == "raw/3ce3_ligand.pdbqt"
        ),
    }
    (HERE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"ok": True, "files": len(artifacts), "manifest": "manifest.json"}))


if __name__ == "__main__":
    main()
