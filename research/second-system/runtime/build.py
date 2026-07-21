#!/usr/bin/env python3
"""Build the compact, promotion-ready 3CE3 runtime bundle.

The source coordinates, charges, AutoDock atom types, and map scalars are read
from the pinned files in ``../raw``.  Grid scalars are serialized only from
their parsed IEEE-754 Float32 representation, in channel-major order.
"""

from __future__ import annotations

import hashlib
import json
import math
import shutil
import struct
from pathlib import Path
from typing import Any, Iterable, Sequence


HERE = Path(__file__).resolve().parent
SOURCE_ROOT = HERE.parent
RAW = SOURCE_ROOT / "raw"
SOURCE_MANIFEST = SOURCE_ROOT / "manifest.json"
SOURCE_SCORES = SOURCE_ROOT / "scores.json"
CHANNELS = ("A", "C", "F", "OA", "N", "HD", "e", "d")
AFFINITY_CHANNELS = CHANNELS[:-2]
MAX_DIRECTORY_BYTES = 3_500_000
AUTODOCK_COMMIT = "89fd1c5e6b4639c22e9a2bea4cc805c42347fffb"
AUTODOCK_REPOSITORY = "https://github.com/ccsb-scripps/AutoDock-GPU"
AUTODOCK_PATH = "input/3ce3/derived"

ELEMENT_BY_TYPE = {
    "A": "C",
    "C": "C",
    "F": "F",
    "HD": "H",
    "N": "N",
    "NA": "N",
    "OA": "O",
    "O": "O",
    "SA": "S",
    "S": "S",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_path(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def write_compact_json(path: Path, value: Any) -> None:
    encoded = json.dumps(value, separators=(",", ":"), allow_nan=False).encode()
    path.write_bytes(encoded)


def source_artifacts() -> dict[str, dict[str, Any]]:
    manifest = json.loads(SOURCE_MANIFEST.read_text())
    if manifest["upstream"]["commit"] != AUTODOCK_COMMIT:
        raise ValueError("The audited upstream commit changed")
    return {artifact["path"]: artifact for artifact in manifest["artifacts"]}


def checked_source(relative_path: str, artifacts: dict[str, dict[str, Any]]) -> Path:
    path = SOURCE_ROOT / relative_path
    artifact = artifacts.get(relative_path)
    if not artifact:
        raise ValueError(f"No audited provenance entry for {relative_path}")
    actual = sha256_path(path)
    if actual != artifact["sha256"]:
        raise ValueError(
            f"Pinned source drift for {relative_path}: "
            f"expected {artifact['sha256']}, found {actual}"
        )
    return path


def parse_map(path: Path) -> dict[str, Any]:
    lines = path.read_text().splitlines()
    if len(lines) < 7:
        raise ValueError(f"Truncated AutoGrid map: {path}")
    header = lines[:6]
    spacing = float(next(line.split()[1] for line in header if line.startswith("SPACING")))
    intervals = tuple(
        int(value)
        for value in next(line for line in header if line.startswith("NELEMENTS")).split()[1:]
    )
    dimensions = tuple(value + 1 for value in intervals)
    center = tuple(
        float(value)
        for value in next(line for line in header if line.startswith("CENTER")).split()[1:]
    )
    values = [float(value) for value in lines[6:]]
    expected_count = math.prod(dimensions)
    if len(values) != expected_count:
        raise ValueError(f"{path.name} has {len(values)} values, expected {expected_count}")
    if not all(math.isfinite(value) for value in values):
        raise ValueError(f"Non-finite value in {path.name}")
    # This round trip defines the browser payload and matches Float32Array.from.
    binary = b"".join(struct.pack("<f", value) for value in values)
    float32_values = [value[0] for value in struct.iter_unpack("<f", binary)]
    return {
        "spacing": spacing,
        "intervals": intervals,
        "dimensions": dimensions,
        "center": center,
        "binary": binary,
        "minimum": min(float32_values),
        "maximum": max(float32_values),
    }


def parse_pdbqt(path: Path) -> list[dict[str, Any]]:
    atoms: list[dict[str, Any]] = []
    for line in path.read_text().splitlines():
        if not line.startswith(("ATOM  ", "HETATM")):
            continue
        fields = line.split()
        atom_type = fields[-1]
        if atom_type not in ELEMENT_BY_TYPE:
            raise ValueError(f"Unsupported AutoDock type {atom_type!r} in {path.name}")
        atom = {
            "id": int(line[6:11]),
            "element": ELEMENT_BY_TYPE[atom_type],
            "name": line[12:16].strip(),
            "residueName": line[17:20].strip(),
            "residueNumber": int(line[22:26]),
            "chainId": line[21:22].strip(),
            "position": [
                float(line[30:38]),
                float(line[38:46]),
                float(line[46:54]),
            ],
            "partialCharge": float(fields[-2]),
            "autodockType": atom_type,
        }
        if not all(math.isfinite(value) for value in atom["position"]):
            raise ValueError(f"Non-finite position in {path.name}")
        if not math.isfinite(atom["partialCharge"]):
            raise ValueError(f"Non-finite charge in {path.name}")
        atoms.append(atom)
    if not atoms:
        raise ValueError(f"No atoms parsed from {path.name}")
    return atoms


def centroid(points: Iterable[Sequence[float]]) -> list[float]:
    values = list(points)
    if not values:
        raise ValueError("Cannot calculate an empty centroid")
    # Match the current TypeScript scorer audit's deterministic accumulation
    # order exactly (add coordinate / atomCount for each atom).
    result = [0.0, 0.0, 0.0]
    for point in values:
        for axis in range(3):
            result[axis] += point[axis] / len(values)
    return result


def squared_distance(left: Sequence[float], right: Sequence[float]) -> float:
    return sum((left[axis] - right[axis]) ** 2 for axis in range(3))


def parse_deposited_atoms(pdb_path: Path) -> tuple[dict[tuple[str, int, str], list[float]], dict[str, tuple[int, list[float]]]]:
    receptor: dict[tuple[str, int, str], list[float]] = {}
    ligand: dict[str, tuple[int, list[float]]] = {}
    for line in pdb_path.read_text().splitlines():
        if not line.startswith(("ATOM  ", "HETATM")):
            continue
        position = [float(line[30:38]), float(line[38:46]), float(line[46:54])]
        name = line[12:16].strip()
        residue_name = line[17:20].strip()
        chain = line[21:22].strip()
        residue_number = int(line[22:26])
        if line.startswith("ATOM  "):
            receptor[(chain, residue_number, name)] = position
        elif residue_name == "1FN":
            ligand[name] = (int(line[6:11]), position)
    return receptor, ligand


def validate_deposited_coordinates(
    receptor: Sequence[dict[str, Any]],
    ligand: Sequence[dict[str, Any]],
    pdb_path: Path,
) -> dict[str, Any]:
    pdb_receptor, pdb_ligand = parse_deposited_atoms(pdb_path)
    receptor_deltas: list[float] = []
    ligand_deltas: list[float] = []
    for atom in receptor:
        if atom["element"] == "H":
            continue
        key = (atom["chainId"], atom["residueNumber"], atom["name"])
        deposited = pdb_receptor.get(key)
        if deposited is None:
            raise ValueError(f"Prepared receptor atom missing from deposited PDB: {key}")
        receptor_deltas.append(math.sqrt(squared_distance(atom["position"], deposited)))
    for atom in ligand:
        if atom["element"] == "H":
            continue
        deposited = pdb_ligand.get(atom["name"])
        if deposited is None:
            raise ValueError(f"Prepared ligand atom missing from deposited PDB: {atom['name']}")
        ligand_deltas.append(math.sqrt(squared_distance(atom["position"], deposited[1])))
    if max(receptor_deltas, default=0) != 0 or max(ligand_deltas, default=0) != 0:
        raise ValueError("Prepared heavy-atom coordinates differ from the deposited PDB")
    return {
        "receptorHeavyAtomsCompared": len(receptor_deltas),
        "ligandHeavyAtomsCompared": len(ligand_deltas),
        "maximumCoordinateDeltaAngstrom": 0,
    }


def ligand_bonds(pdb_path: Path, ligand: Sequence[dict[str, Any]]) -> list[dict[str, int]]:
    _, deposited = parse_deposited_atoms(pdb_path)
    deposited_serial_to_name = {serial: name for name, (serial, _) in deposited.items()}
    prepared_name_to_id = {atom["name"]: atom["id"] for atom in ligand}
    bonds: set[tuple[int, int]] = set()
    for line in pdb_path.read_text().splitlines():
        if not line.startswith("CONECT"):
            continue
        serials = [int(value) for value in line.split()[1:]]
        left_name = deposited_serial_to_name.get(serials[0])
        if left_name is None:
            continue
        for serial in serials[1:]:
            right_name = deposited_serial_to_name.get(serial)
            if right_name is None:
                continue
            left_id = prepared_name_to_id[left_name]
            right_id = prepared_name_to_id[right_name]
            bonds.add(tuple(sorted((left_id, right_id))))
    for hydrogen_name, donor_name in {"H29": "N29", "H3": "N3", "H15": "N15"}.items():
        bonds.add(tuple(sorted((prepared_name_to_id[hydrogen_name], prepared_name_to_id[donor_name]))))
    return [{"a": left, "b": right, "order": 1} for left, right in sorted(bonds)]


def compact_receptor_atom(atom: dict[str, Any]) -> dict[str, Any]:
    # All atoms belong to chain A; atom name and chain are intentionally stored
    # once at receptor level to meet the runtime budget. Residue identity stays.
    return {
        "id": atom["id"],
        "element": atom["element"],
        "residueName": atom["residueName"],
        "residueNumber": atom["residueNumber"],
        "position": atom["position"],
        "partialCharge": atom["partialCharge"],
        "autodockType": atom["autodockType"],
    }


def runtime_files_for_hashing() -> list[Path]:
    names = [
        "3ce3-autogrid.f32",
        "3ce3-autogrid-runtime.json",
        "3ce3-system.json",
        "LICENSE-AUTODOCK-GPU-GPL-2.0.txt",
        "README.md",
        "build.py",
        "verify.mts",
    ]
    return [HERE / name for name in names]


def build() -> None:
    artifacts = source_artifacts()
    pdb_path = checked_source("raw/3CE3.pdb", artifacts)
    receptor_path = checked_source("raw/3ce3_protein.pdbqt", artifacts)
    ligand_path = checked_source("raw/3ce3_ligand.pdbqt", artifacts)
    license_source = checked_source("UPSTREAM_LICENSE_GPL-2.0.txt", artifacts)

    maps: dict[str, dict[str, Any]] = {}
    for channel in CHANNELS:
        relative = f"raw/3ce3_protein.{channel}.map"
        maps[channel] = parse_map(checked_source(relative, artifacts))
    first = maps[CHANNELS[0]]
    for channel, parsed in maps.items():
        for field in ("spacing", "intervals", "dimensions", "center"):
            if parsed[field] != first[field]:
                raise ValueError(f"AutoGrid {field} mismatch in channel {channel}")

    binary = b"".join(maps[channel]["binary"] for channel in CHANNELS)
    binary_path = HERE / "3ce3-autogrid.f32"
    binary_path.write_bytes(binary)
    values_per_channel = math.prod(first["dimensions"])
    bytes_per_channel = values_per_channel * 4
    expected_scores = json.loads(SOURCE_SCORES.read_text())
    source_center = list(first["center"])
    source_origin = [
        source_center[axis]
        - ((first["dimensions"][axis] - 1) / 2) * first["spacing"]
        for axis in range(3)
    ]

    grid_document = {
        "schemaVersion": "1.0.0",
        "autoGrid": {
            "spacing": first["spacing"],
            "dimensions": dict(zip(("x", "y", "z"), first["dimensions"])),
            "center": source_center,
            "sourceCenter": source_center,
            "origin": source_origin,
            "sourceOrigin": source_origin,
            "coordinateUnits": "angstrom",
            "coordinateFrame": "upstream-pdbqt-source",
            "ordering": {
                "linearIndex": "x + nx * (y + ny * z)",
                "axisOrder": ["x", "y", "z"],
                "xFastest": True,
            },
            "channelOrder": list(CHANNELS),
            "binary": {
                "url": "/data/3ce3-autogrid.f32",
                "dtype": "float32",
                "endianness": "little",
                "layout": "channel-major",
                "channelOrder": list(CHANNELS),
                "valuesPerChannel": values_per_channel,
                "bytesPerChannel": bytes_per_channel,
                "byteOffsets": {
                    channel: index * bytes_per_channel
                    for index, channel in enumerate(CHANNELS)
                },
                "byteLength": len(binary),
                "sha256": sha256_bytes(binary),
            },
            "provenance": {
                "repository": AUTODOCK_REPOSITORY,
                "commit": AUTODOCK_COMMIT,
                "commitUrl": f"{AUTODOCK_REPOSITORY}/commit/{AUTODOCK_COMMIT}",
                "path": AUTODOCK_PATH,
                "sourceFiles": {
                    channel: {
                        "path": f"{AUTODOCK_PATH}/3ce3_protein.{channel}.map",
                        "sha256": artifacts[f"raw/3ce3_protein.{channel}.map"]["sha256"],
                    }
                    for channel in CHANNELS
                },
                "license": {
                    "id": "GPL-2.0-or-later",
                    "treatment": "conservative-upstream-repository-license",
                    "licenseFile": "/data/LICENSE-AUTODOCK-GPU-GPL-2.0.txt",
                },
            },
            "validation": {
                "totalValueCount": values_per_channel * len(CHANNELS),
                "valuesPerChannel": values_per_channel,
                "allFinite": True,
                "channels": {
                    channel: {
                        "count": values_per_channel,
                        "minimum": maps[channel]["minimum"],
                        "maximum": maps[channel]["maximum"],
                        "sourceSha256": artifacts[f"raw/3ce3_protein.{channel}.map"]["sha256"],
                    }
                    for channel in CHANNELS
                },
                "posePanel": expected_scores["poses"],
                "interpretation": (
                    "Lower is more favorable. These are target-specific AutoGrid rigid-pose "
                    "energy terms, not experimental affinity or a docking prediction."
                ),
            },
        },
    }
    grid_path = HERE / "3ce3-autogrid-runtime.json"
    write_compact_json(grid_path, grid_document)

    receptor = parse_pdbqt(receptor_path)
    ligand = parse_pdbqt(ligand_path)
    coordinate_validation = validate_deposited_coordinates(receptor, ligand, pdb_path)
    bonds = ligand_bonds(pdb_path, ligand)
    ligand_centroid = centroid(atom["position"] for atom in ligand)
    ligand_heavy = [atom for atom in ligand if atom["element"] != "H"]
    pocket_cutoff = 5.0
    pocket_residues = sorted(
        {
            (atom["residueNumber"], atom["residueName"])
            for atom in receptor
            if atom["element"] != "H"
            and any(
                squared_distance(atom["position"], ligand_atom["position"])
                <= pocket_cutoff**2
                for ligand_atom in ligand_heavy
            )
        }
    )
    ligand_types = sorted({atom["autodockType"] for atom in ligand})
    missing_maps = sorted(set(ligand_types) - set(AFFINITY_CHANNELS))
    if missing_maps:
        raise ValueError(f"Missing affinity channels for ligand types: {missing_maps}")

    system_document = {
        "schemaVersion": "1.0.0",
        "system": {
            "id": "3ce3-1fn",
            "name": "c-MET kinase + experimental inhibitor 1FN",
            "entryId": "3CE3",
            "ligand": {
                "ccdId": "1FN",
                "name": "experimental inhibitor 1FN",
                "formula": "C25 H16 F2 N4 O3",
            },
            "method": "X-RAY DIFFRACTION",
            "resolutionAngstrom": 2.4,
            "sourceUrl": "https://www.rcsb.org/structure/3CE3",
            "license": "RCSB PDB coordinates: CC0; prepared AutoDock-GPU benchmark: GPL-2.0-or-later",
            "scope": (
                "Pinned AutoDock-GPU 3CE3 benchmark: rigid prepared c-MET kinase receptor, "
                "experimental inhibitor 1FN, and target-specific AutoGrid maps."
            ),
            "limitations": [
                "1FN is an experimental inhibitor, not an approved medicine.",
                "Rigid ligand and receptor; no conformational search or minimization.",
                "The score is a local pose readout, not binding affinity or predictive docking.",
                "Prepared polar hydrogens, atom types, and charges come from the pinned upstream PDBQT files.",
            ],
        },
        "provenance": {
            "structure": {
                "provider": "RCSB Protein Data Bank / wwPDB",
                "entryId": "3CE3",
                "entryUrl": "https://www.rcsb.org/structure/3CE3",
                "structureDoi": "https://doi.org/10.2210/pdb3ce3/pdb",
                "coordinateSnapshotSha256": artifacts["raw/3CE3.pdb"]["sha256"],
                "license": "CC0-1.0",
                "policyUrl": "https://www.rcsb.org/pages/usage-policy",
            },
            "autoDockBenchmark": {
                "provider": "CCSB Scripps AutoDock-GPU",
                "repository": AUTODOCK_REPOSITORY,
                "commit": AUTODOCK_COMMIT,
                "path": AUTODOCK_PATH,
                "receptorPdbqtSha256": artifacts["raw/3ce3_protein.pdbqt"]["sha256"],
                "ligandPdbqtSha256": artifacts["raw/3ce3_ligand.pdbqt"]["sha256"],
                "license": "GPL-2.0-or-later",
                "licenseFile": "/data/LICENSE-AUTODOCK-GPU-GPL-2.0.txt",
            },
        },
        "frame": {
            "center": ligand_centroid,
            "pocketCenter": ligand_centroid,
            "referenceLigandCentroid": ligand_centroid,
            "coordinateUnits": "angstrom",
            "coordinateFrame": "upstream-pdbqt-source",
            "note": "Coordinates are unchanged from the pinned PDBQT files; centroid uses all 37 prepared ligand atoms.",
        },
        "receptor": {
            "chainId": "A",
            "atoms": [compact_receptor_atom(atom) for atom in receptor],
            "bonds": [],
            "compactSchemaNote": (
                "Atom name and chainId are omitted per atom to meet the payload budget; all atoms are chain A. "
                "Residue identity, coordinates, charge, and AutoDock type are preserved."
            ),
        },
        "ligand": {
            "atoms": ligand,
            "bonds": bonds,
            "bondMethod": (
                "Display only: heavy-atom connectivity from the pinned 3CE3 PDB CONECT records; "
                "three polar H-N bonds from the upstream PDBQT atom names. Bond orders render as single."
            ),
            "referencePose": {
                "positions": [atom["position"] for atom in ligand],
                "experimentalHeavyAtomCount": len(ligand_heavy),
                "modeledPolarHydrogenCount": len(ligand) - len(ligand_heavy),
                "source": "Pinned AutoDock-GPU prepared co-crystal input pose; not predicted by SNAP.",
            },
            "formalCharge": 0,
        },
        "pocket": {
            "residues": [f"{name}{number}" for number, name in pocket_residues],
            "residueCutoffAngstrom": pocket_cutoff,
        },
        "scoring": {
            "kind": "AutoDock4-AutoGrid-precomputed-intermolecular-energy",
            "autoGridManifest": "/data/3ce3-autogrid-runtime.json",
            "autoGridBinary": "/data/3ce3-autogrid.f32",
            "equation": "atomTypeMap + q*electrostaticsMap + abs(q)*desolvationMap",
            "termLabels": ["atom-type affinity", "electrostatics", "desolvation"],
            "interpolation": "trilinear",
            "lowerIsMoreFavorable": True,
            "referencePoseScore": expected_scores["poses"]["reference"]["total"],
            "interpretation": (
                "Genuine target-specific AutoGrid rigid-pose energy, not a binding free energy, "
                "docking search, drug recommendation, or clinical prediction."
            ),
        },
        "validation": {
            "counts": {
                "receptorAtoms": len(receptor),
                "ligandAtoms": len(ligand),
                "ligandHeavyAtoms": len(ligand_heavy),
                "ligandDisplayBonds": len(bonds),
                "gridChannels": len(CHANNELS),
                "gridValuesPerChannel": values_per_channel,
            },
            "sourceCoordinateChecks": coordinate_validation,
            "gridChecks": {
                "referenceCrystalPoseScore": expected_scores["poses"]["reference"]["total"],
                "translatedXMinus1AngstromScore": expected_scores["poses"]["translated_x_minus_1"]["total"],
                "translatedZPlus1AngstromScore": expected_scores["poses"]["translated_z_plus_1"]["total"],
                "rotated15DegreesScore": expected_scores["poses"]["rotated_z_15deg"]["total"],
            },
        },
    }
    system_path = HERE / "3ce3-system.json"
    write_compact_json(system_path, system_document)

    shutil.copyfile(license_source, HERE / "LICENSE-AUTODOCK-GPU-GPL-2.0.txt")

    bundle_artifacts = []
    for path in runtime_files_for_hashing():
        if not path.exists():
            raise FileNotFoundError(f"Required runtime artifact is missing: {path.name}")
        bundle_artifacts.append(
            {"path": path.name, "bytes": path.stat().st_size, "sha256": sha256_path(path)}
        )
    bundle_manifest = {
        "schemaVersion": 1,
        "hashAlgorithm": "sha256",
        "selfExcludedToAvoidCircularHash": "bundle-manifest.json",
        "maximumDirectoryBytes": MAX_DIRECTORY_BYTES,
        "artifacts": bundle_artifacts,
        "totalHashedArtifactBytes": sum(item["bytes"] for item in bundle_artifacts),
    }
    write_compact_json(HERE / "bundle-manifest.json", bundle_manifest)

    directory_bytes = sum(path.stat().st_size for path in HERE.iterdir() if path.is_file())
    if directory_bytes > MAX_DIRECTORY_BYTES:
        raise ValueError(
            f"Runtime directory is {directory_bytes:,} bytes; budget is {MAX_DIRECTORY_BYTES:,}"
        )
    print(
        json.dumps(
            {
                "ok": True,
                "binaryBytes": len(binary),
                "systemBytes": system_path.stat().st_size,
                "gridManifestBytes": grid_path.stat().st_size,
                "directoryBytes": directory_bytes,
                "budgetBytes": MAX_DIRECTORY_BYTES,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    build()
