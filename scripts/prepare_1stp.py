#!/usr/bin/env python3
"""Build SNAP's reproducible 1STP/biotin browser data package.

The package combines two primary, independently attributable sources:

* wwPDB/RCSB PDB entry 1STP and the BTN Chemical Component Dictionary entry.
* The pinned 1STP AutoGrid benchmark distributed by ccsb-scripps/AutoDock-GPU.

No atom types, partial charges, or grid values are invented by this script. The
AutoDock PDBQT preparation and AutoGrid values are copied from the pinned
upstream benchmark, validated, recentered, and serialized for browser use.

Run from the repository root:

    python3 scripts/prepare_1stp.py

For an offline rebuild from an existing AutoDock-GPU checkout:

    python3 scripts/prepare_1stp.py \
      --pdb /path/to/1STP.pdb \
      --ccd /path/to/BTN.cif \
      --autodock-root /path/to/AutoDock-GPU
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shlex
import struct
import tempfile
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable, Sequence


PDB_ID = "1STP"
CCD_ID = "BTN"
AUTODOCK_COMMIT = "89fd1c5e6b4639c22e9a2bea4cc805c42347fffb"
AUTODOCK_REPO = "https://github.com/ccsb-scripps/AutoDock-GPU"
AUTODOCK_DERIVED_PATH = "input/1stp/derived"
RCSB_PDB_URL = "https://files.rcsb.org/download/1STP.pdb"
RCSB_CCD_URL = "https://files.rcsb.org/ligands/download/BTN.cif"
RCSB_USAGE_URL = "https://www.rcsb.org/pages/usage-policy"
RCSB_ENTRY_URL = "https://www.rcsb.org/structure/1STP"
RCSB_ENTRY_API_URL = "https://data.rcsb.org/rest/v1/core/entry/1stp"
RCSB_CCD_API_URL = "https://data.rcsb.org/rest/v1/core/chemcomp/BTN"
AUTODOCK_RAW_BASE = (
    f"https://raw.githubusercontent.com/ccsb-scripps/AutoDock-GPU/"
    f"{AUTODOCK_COMMIT}"
)

CHANNELS = ("A", "C", "OA", "N", "SA", "HD", "e", "d")
GRID_DIMENSIONS = (25, 23, 33)
GRID_SPACING = 0.375
GRID_SOURCE_CENTER = (10.734, 2.033, -11.537)
GRID_VALUE_COUNT = math.prod(GRID_DIMENSIONS)

EXPECTED_SHA256 = {
    "1STP.pdb": "6fbb3d5c324e717fe7284703426e74ea58191431720daab1b2faa0bbb6430f30",
    "BTN.cif": "9fff069dc9e0387d49c3ef62cab0867a10dae56274931a779fb87f377b9c11ea",
    "1stp_ligand.pdbqt": "f35894b3bc097b9acb25a96aec19d16d81f4ca0e9a6bb657fad49c94d074e231",
    "1stp_protein.pdbqt": "f30d46043ae82e28041bc7b5fb2f707bbb1ebc52cb646d52aa7bfb6ebcf0e946",
    "1stp_protein.A.map": "4bc02b07d3179c4146bfdcaefb8d43334a0ae3f5db5d7a6813982b4b85c0d374",
    "1stp_protein.C.map": "e8aa7ed6f69b3c998cc3d24c115174240650b3e4840b47fb791d61b2021d929d",
    "1stp_protein.OA.map": "ef1e40f3fcd820a5f7d6dc664c44d4edea55c3f8d82c97c1e12d7ecdb4a0b4db",
    "1stp_protein.N.map": "35e322aa01e2e3837342951eb65220c14e853fce9057b9e67ed626ff08797a57",
    "1stp_protein.SA.map": "55506502bacfefddf02468e6cc5d1e2d61a5a11ad111a5b71cf28a3c0ac80446",
    "1stp_protein.HD.map": "fe6cdca43ba02bc895e2bb1d3ab95e75406fc23ea88a13ba4a23cc1db22ee58e",
    "1stp_protein.e.map": "d24fe2a7d486a5dacd582e2b1fae06b7becee3ed22d523efc481316a30d4bb74",
    "1stp_protein.d.map": "ae95050c06fca78e796c8a1e573d3b77f44e4b4097562523adb4ff2ef57bbbf2",
    "LICENSE": "4efdbc005c9b557547d62fa9b9885a6837aca508414bcc7b4b93842ce31b6f66",
}

ELEMENT_BY_AUTODOCK_TYPE = {
    "A": "C",
    "C": "C",
    "HD": "H",
    "N": "N",
    "NA": "N",
    "OA": "O",
    "O": "O",
    "SA": "S",
    "S": "S",
}

COVALENT_RADIUS = {
    "H": 0.31,
    "C": 0.76,
    "N": 0.71,
    "O": 0.66,
    "S": 1.05,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdb", type=Path, help="Official RCSB 1STP PDB file")
    parser.add_argument("--ccd", type=Path, help="Official RCSB BTN CCD CIF file")
    parser.add_argument(
        "--autodock-root",
        type=Path,
        help="AutoDock-GPU checkout pinned to the documented commit",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "public" / "data",
    )
    parser.add_argument(
        "--allow-source-drift",
        action="store_true",
        help="Allow input hashes to differ from this audited build",
    )
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "SNAP-BuildWeek/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        destination.write_bytes(response.read())


def checked(path: Path, logical_name: str, allow_drift: bool) -> Path:
    actual = sha256(path)
    expected = EXPECTED_SHA256[logical_name]
    if actual != expected and not allow_drift:
        raise ValueError(
            f"Source drift for {logical_name}: expected {expected}, found {actual}. "
            "Review the upstream revision before using --allow-source-drift."
        )
    return path


def resolve_sources(args: argparse.Namespace, scratch: Path) -> dict[str, Path]:
    sources: dict[str, Path] = {}

    pdb_path = args.pdb or scratch / "1STP.pdb"
    if args.pdb is None:
        download(RCSB_PDB_URL, pdb_path)
    sources["1STP.pdb"] = checked(pdb_path, "1STP.pdb", args.allow_source_drift)

    ccd_path = args.ccd or scratch / "BTN.cif"
    if args.ccd is None:
        download(RCSB_CCD_URL, ccd_path)
    sources["BTN.cif"] = checked(ccd_path, "BTN.cif", args.allow_source_drift)

    if args.autodock_root:
        derived_root = args.autodock_root / AUTODOCK_DERIVED_PATH
        license_path = args.autodock_root / "LICENSE"
    else:
        derived_root = scratch / AUTODOCK_DERIVED_PATH
        license_path = scratch / "LICENSE"

    upstream_files = ["1stp_ligand.pdbqt", "1stp_protein.pdbqt"] + [
        f"1stp_protein.{channel}.map" for channel in CHANNELS
    ]
    for filename in upstream_files:
        path = derived_root / filename
        if args.autodock_root is None:
            download(
                f"{AUTODOCK_RAW_BASE}/{AUTODOCK_DERIVED_PATH}/{filename}",
                path,
            )
        sources[filename] = checked(path, filename, args.allow_source_drift)

    if args.autodock_root is None:
        download(f"{AUTODOCK_RAW_BASE}/LICENSE", license_path)
    sources["LICENSE"] = checked(license_path, "LICENSE", args.allow_source_drift)
    return sources


def parse_pdb_atoms(text: str) -> list[dict[str, Any]]:
    atoms: list[dict[str, Any]] = []
    for line in text.splitlines():
        if not line.startswith(("ATOM  ", "HETATM")):
            continue
        alt_loc = line[16:17]
        if alt_loc not in (" ", "A"):
            continue
        atoms.append(
            {
                "record": line[0:6].strip(),
                "serial": int(line[6:11]),
                "name": line[12:16].strip(),
                "residueName": line[17:20].strip(),
                "chainId": line[21:22].strip(),
                "residueNumber": int(line[22:26]),
                "source": [
                    float(line[30:38]),
                    float(line[38:46]),
                    float(line[46:54]),
                ],
                "occupancy": float(line[54:60]),
                "bFactor": float(line[60:66]),
                "element": line[76:78].strip(),
            }
        )
    return atoms


def parse_pdbqt(path: Path) -> list[dict[str, Any]]:
    atoms: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith(("ATOM  ", "HETATM")):
            continue
        atom_type = line[77:79].strip()
        if atom_type not in ELEMENT_BY_AUTODOCK_TYPE:
            raise ValueError(f"Unsupported AutoDock type {atom_type!r} in {path}")
        atoms.append(
            {
                "record": line[0:6].strip(),
                "serial": int(line[6:11]),
                "name": line[12:16].strip(),
                "residueName": line[17:20].strip(),
                "chainId": line[21:22].strip(),
                "residueNumber": int(line[22:26]),
                "source": [
                    float(line[30:38]),
                    float(line[38:46]),
                    float(line[46:54]),
                ],
                "occupancy": float(line[54:60]),
                "bFactor": float(line[60:66]),
                "partialCharge": float(line[70:76]),
                "autodockType": atom_type,
                "element": ELEMENT_BY_AUTODOCK_TYPE[atom_type],
            }
        )
    return atoms


def parse_biomt(text: str) -> dict[int, list[list[float]]]:
    rows: dict[int, dict[int, list[float]]] = defaultdict(dict)
    pattern = re.compile(
        r"REMARK 350\s+BIOMT([123])\s+(\d+)\s+"
        r"([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)"
    )
    for line in text.splitlines():
        match = pattern.match(line)
        if not match:
            continue
        row = int(match.group(1)) - 1
        operation = int(match.group(2))
        rows[operation][row] = [float(value) for value in match.groups()[2:]]
    matrices = {
        operation: [row_map[index] for index in range(3)]
        for operation, row_map in rows.items()
    }
    if sorted(matrices) != [1, 2, 3, 4]:
        raise ValueError(f"Unexpected 1STP biological assembly operations: {matrices.keys()}")
    return matrices


def transform_point(point: Sequence[float], matrix: Sequence[Sequence[float]]) -> list[float]:
    x, y, z = point
    return [
        row[0] * x + row[1] * y + row[2] * z + row[3]
        for row in matrix
    ]


def distance(a: Sequence[float], b: Sequence[float]) -> float:
    return math.sqrt(sum((a[index] - b[index]) ** 2 for index in range(3)))


def centroid(points: Iterable[Sequence[float]]) -> list[float]:
    values = list(points)
    if not values:
        raise ValueError("Cannot calculate an empty centroid")
    return [sum(point[axis] for point in values) / len(values) for axis in range(3)]


def rounded(value: float, digits: int = 6) -> float:
    result = round(value, digits)
    return 0.0 if result == -0.0 else result


def recenter(point: Sequence[float], origin: Sequence[float]) -> list[float]:
    return [rounded(point[index] - origin[index]) for index in range(3)]


def browser_atom(
    atom: dict[str, Any],
    atom_id: int,
    render_origin: Sequence[float],
    source_position: Sequence[float] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    raw = list(source_position or atom["source"])
    centered = recenter(raw, render_origin)
    result: dict[str, Any] = {
        "id": atom_id,
        "sourceSerial": atom["serial"],
        "element": atom["element"],
        "name": atom["name"],
        "residueName": atom["residueName"],
        "residueNumber": atom["residueNumber"],
        "chainId": atom["chainId"],
        "x": centered[0],
        "y": centered[1],
        "z": centered[2],
        "occupancy": atom["occupancy"],
        "bFactor": atom["bFactor"],
    }
    if "partialCharge" in atom:
        result.update(
            {
                "partialCharge": atom["partialCharge"],
                "autodockType": atom["autodockType"],
                "isPolarHydrogen": atom["autodockType"] == "HD",
                "isAcceptor": atom["autodockType"] in {"NA", "OA", "SA"},
            }
        )
    if extra:
        result.update(extra)
    return result


def infer_protein_bonds(atoms: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Infer only unambiguous display bonds from residue membership and distance."""

    by_residue: dict[tuple[str, int, str], list[dict[str, Any]]] = defaultdict(list)
    for atom in atoms:
        by_residue[(atom["chainId"], atom["residueNumber"], atom["residueName"])].append(atom)

    bonds: set[tuple[int, int]] = set()
    for residue_atoms in by_residue.values():
        for left_index, left in enumerate(residue_atoms):
            for right in residue_atoms[left_index + 1 :]:
                radius = COVALENT_RADIUS[left["element"]] + COVALENT_RADIUS[right["element"]]
                d = distance(
                    (left["x"], left["y"], left["z"]),
                    (right["x"], right["y"], right["z"]),
                )
                if 0.45 <= d <= radius + 0.45:
                    bonds.add(tuple(sorted((left["id"], right["id"]))))

    # Add peptide C-N bonds only between sequential residues in the same chain.
    atoms_by_key = {
        (atom["chainId"], atom["residueNumber"], atom["name"]): atom for atom in atoms
    }
    residue_numbers = sorted({(atom["chainId"], atom["residueNumber"]) for atom in atoms})
    for chain, number in residue_numbers:
        carbon = atoms_by_key.get((chain, number, "C"))
        nitrogen = atoms_by_key.get((chain, number + 1, "N"))
        if carbon and nitrogen:
            d = distance(
                (carbon["x"], carbon["y"], carbon["z"]),
                (nitrogen["x"], nitrogen["y"], nitrogen["z"]),
            )
            if d <= 1.6:
                bonds.add(tuple(sorted((carbon["id"], nitrogen["id"]))))

    return [
        {"a": left, "b": right, "order": 1, "source": "distance-inferred-display"}
        for left, right in sorted(bonds)
    ]


def parse_cif_loop(text: str, prefix: str) -> list[dict[str, str]]:
    lines = text.splitlines()
    index = 0
    results: list[dict[str, str]] = []
    while index < len(lines):
        if lines[index].strip() != "loop_":
            index += 1
            continue
        index += 1
        headers: list[str] = []
        while index < len(lines) and lines[index].lstrip().startswith("_"):
            headers.append(lines[index].strip())
            index += 1
        if not headers or not headers[0].startswith(prefix):
            while index < len(lines) and lines[index].strip() != "#":
                index += 1
            continue
        tokens: list[str] = []
        while index < len(lines) and lines[index].strip() != "#":
            if lines[index].strip():
                tokens.extend(shlex.split(lines[index], comments=False, posix=True))
            index += 1
        if len(tokens) % len(headers):
            raise ValueError(f"Malformed CIF loop {prefix}")
        for offset in range(0, len(tokens), len(headers)):
            results.append(dict(zip(headers, tokens[offset : offset + len(headers)])))
    return results


def ligand_bonds(ccd_text: str, atoms: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    atom_by_ccd_name: dict[str, dict[str, Any]] = {}
    for atom in atoms:
        ccd_name = {"H1": "HN1", "H2": "HN2"}.get(atom["name"], atom["name"])
        atom_by_ccd_name[ccd_name] = atom
    order_lookup = {"SING": 1, "DOUB": 2, "TRIP": 3, "AROM": 1.5}
    bonds: list[dict[str, Any]] = []
    for row in parse_cif_loop(ccd_text, "_chem_comp_bond."):
        left_name = row["_chem_comp_bond.atom_id_1"]
        right_name = row["_chem_comp_bond.atom_id_2"]
        if left_name not in atom_by_ccd_name or right_name not in atom_by_ccd_name:
            continue
        bonds.append(
            {
                "a": atom_by_ccd_name[left_name]["id"],
                "b": atom_by_ccd_name[right_name]["id"],
                "order": order_lookup[row["_chem_comp_bond.value_order"]],
                "source": "RCSB-CCD",
            }
        )
    return bonds


def parse_map(path: Path) -> tuple[list[float], dict[str, Any]]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if len(lines) < 7:
        raise ValueError(f"Map file is too short: {path}")
    header = lines[:6]
    spacing = float(next(line.split()[1] for line in header if line.startswith("SPACING")))
    nelements = tuple(
        int(value)
        for value in next(line for line in header if line.startswith("NELEMENTS")).split()[1:]
    )
    center = tuple(
        float(value)
        for value in next(line for line in header if line.startswith("CENTER")).split()[1:]
    )
    values = [float(value) for value in lines[6:]]
    if spacing != GRID_SPACING:
        raise ValueError(f"Unexpected spacing in {path}: {spacing}")
    if tuple(value + 1 for value in nelements) != GRID_DIMENSIONS:
        raise ValueError(f"Unexpected dimensions in {path}: {nelements}")
    if center != GRID_SOURCE_CENTER:
        raise ValueError(f"Unexpected center in {path}: {center}")
    if len(values) != GRID_VALUE_COUNT:
        raise ValueError(f"Unexpected value count in {path}: {len(values)}")
    if not all(math.isfinite(value) for value in values):
        raise ValueError(f"Non-finite grid value in {path}")
    return values, {
        "count": len(values),
        "minimum": min(values),
        "maximum": max(values),
        "sourceSha256": sha256(path),
    }


def grid_source_origin() -> list[float]:
    return [
        GRID_SOURCE_CENTER[axis]
        - ((GRID_DIMENSIONS[axis] - 1) / 2) * GRID_SPACING
        for axis in range(3)
    ]


def interpolate_grid(
    values: Sequence[float], point: Sequence[float], source_origin: Sequence[float]
) -> float | None:
    nx, ny, nz = GRID_DIMENSIONS
    gx, gy, gz = [
        (point[axis] - source_origin[axis]) / GRID_SPACING for axis in range(3)
    ]
    if not (0 <= gx < nx - 1 and 0 <= gy < ny - 1 and 0 <= gz < nz - 1):
        return None
    x0, y0, z0 = math.floor(gx), math.floor(gy), math.floor(gz)
    dx, dy, dz = gx - x0, gy - y0, gz - z0
    value = 0.0
    for z, wz in ((z0, 1 - dz), (z0 + 1, dz)):
        for y, wy in ((y0, 1 - dy), (y0 + 1, dy)):
            for x, wx in ((x0, 1 - dx), (x0 + 1, dx)):
                index = x + nx * (y + ny * z)
                value += values[index] * wx * wy * wz
    return value


def score_pose(
    ligand_atoms: Sequence[dict[str, Any]],
    source_positions: Sequence[Sequence[float]],
    maps: dict[str, Sequence[float]],
) -> dict[str, Any]:
    origin = grid_source_origin()
    affinity = 0.0
    electrostatics = 0.0
    desolvation = 0.0
    per_atom: list[dict[str, Any]] = []
    for atom, point in zip(ligand_atoms, source_positions):
        map_type = atom["autodockType"]
        affinity_value = interpolate_grid(maps[map_type], point, origin)
        electrostatic_value = interpolate_grid(maps["e"], point, origin)
        desolvation_value = interpolate_grid(maps["d"], point, origin)
        if None in (affinity_value, electrostatic_value, desolvation_value):
            return {"insideGrid": False, "score": None}
        atom_electrostatics = atom["partialCharge"] * electrostatic_value
        atom_desolvation = abs(atom["partialCharge"]) * desolvation_value
        affinity += affinity_value
        electrostatics += atom_electrostatics
        desolvation += atom_desolvation
        per_atom.append(
            {
                "atomId": atom["id"],
                "affinity": rounded(affinity_value),
                "electrostatics": rounded(atom_electrostatics),
                "desolvation": rounded(atom_desolvation),
            }
        )
    total = affinity + electrostatics + desolvation
    return {
        "insideGrid": True,
        "score": rounded(total),
        "components": {
            "atomTypeAffinity": rounded(affinity),
            "electrostatics": rounded(electrostatics),
            "desolvation": rounded(desolvation),
        },
        "perAtom": per_atom,
    }


def rotate_about_z(
    points: Sequence[Sequence[float]], center: Sequence[float], degrees: float
) -> list[list[float]]:
    radians = math.radians(degrees)
    cosine, sine = math.cos(radians), math.sin(radians)
    rotated: list[list[float]] = []
    for point in points:
        x, y, z = [point[axis] - center[axis] for axis in range(3)]
        rotated.append(
            [
                center[0] + x * cosine - y * sine,
                center[1] + x * sine + y * cosine,
                center[2] + z,
            ]
        )
    return rotated


def closest_distance(
    left: Iterable[Sequence[float]], right: Iterable[Sequence[float]]
) -> float:
    left_points, right_points = list(left), list(right)
    return min(distance(a, b) for a in left_points for b in right_points)


def build(args: argparse.Namespace) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="snap-1stp-") as directory:
        scratch = Path(directory)
        sources = resolve_sources(args, scratch)
        pdb_text = sources["1STP.pdb"].read_text(encoding="utf-8")
        ccd_text = sources["BTN.cif"].read_text(encoding="utf-8")
        pdb_atoms = parse_pdb_atoms(pdb_text)
        receptor_source = parse_pdbqt(sources["1stp_protein.pdbqt"])
        ligand_source = parse_pdbqt(sources["1stp_ligand.pdbqt"])

        ligand_heavy_source = [
            atom["source"] for atom in ligand_source if atom["element"] != "H"
        ]
        render_origin = centroid(ligand_heavy_source)
        source_grid_origin = grid_source_origin()

        receptor_atoms = [
            browser_atom(atom, atom_id, render_origin)
            for atom_id, atom in enumerate(receptor_source)
        ]
        ligand_atoms = [
            browser_atom(atom, atom_id, render_origin)
            for atom_id, atom in enumerate(ligand_source)
        ]
        receptor_bonds = infer_protein_bonds(receptor_atoms)
        btn_bonds = ligand_bonds(ccd_text, ligand_atoms)

        # Heavy-atom coordinates in the PDBQT benchmark must be identical to the
        # deposited RCSB coordinates. Polar hydrogens are modeled upstream.
        pdb_receptor_heavy = {
            (atom["chainId"], atom["residueNumber"], atom["name"]): atom
            for atom in pdb_atoms
            if atom["record"] == "ATOM"
        }
        pdb_ligand_heavy = {
            atom["name"]: atom
            for atom in pdb_atoms
            if atom["residueName"] == CCD_ID and atom["element"] != "H"
        }
        receptor_coordinate_deltas: list[float] = []
        for atom in receptor_source:
            if atom["element"] == "H":
                continue
            deposited = pdb_receptor_heavy[
                (atom["chainId"], atom["residueNumber"], atom["name"])
            ]
            receptor_coordinate_deltas.append(distance(atom["source"], deposited["source"]))
        ligand_coordinate_deltas = [
            distance(atom["source"], pdb_ligand_heavy[atom["name"]]["source"])
            for atom in ligand_source
            if atom["element"] != "H"
        ]

        matrices = parse_biomt(pdb_text)
        ligand_heavy = [
            atom for atom in ligand_source if atom["element"] != "H"
        ]
        assembly_contact_source: list[tuple[dict[str, Any], list[float], int]] = []
        contact_residue_keys: list[tuple[int, str, int]] = []
        for operation, matrix in matrices.items():
            if operation == 1:
                continue
            transformed_by_residue: dict[tuple[str, int], list[tuple[dict[str, Any], list[float]]]] = defaultdict(list)
            for atom in receptor_source:
                transformed_by_residue[(atom["residueName"], atom["residueNumber"])].append(
                    (atom, transform_point(atom["source"], matrix))
                )
            for (residue_name, residue_number), transformed_atoms in transformed_by_residue.items():
                heavy_positions = [
                    point for atom, point in transformed_atoms if atom["element"] != "H"
                ]
                minimum = closest_distance(
                    heavy_positions, (atom["source"] for atom in ligand_heavy)
                )
                if minimum <= 5.0:
                    contact_residue_keys.append((operation, residue_name, residue_number))
                    assembly_contact_source.extend(
                        (atom, point, operation) for atom, point in transformed_atoms
                    )

        operation_chain = {2: "B", 3: "C", 4: "D"}
        assembly_contact_atoms: list[dict[str, Any]] = []
        for atom_id, (atom, transformed, operation) in enumerate(assembly_contact_source):
            assembly_contact_atoms.append(
                browser_atom(
                    atom,
                    atom_id,
                    render_origin,
                    source_position=transformed,
                    extra={
                        "chainId": operation_chain[operation],
                        "sourceChainId": atom["chainId"],
                        "assemblyOperation": operation,
                        "excludedFromAutoGridScore": True,
                    },
                )
            )
        assembly_contact_bonds = infer_protein_bonds(assembly_contact_atoms)

        main_residues: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
        for atom in receptor_source:
            main_residues[(atom["residueName"], atom["residueNumber"])].append(atom)
        pocket_residues: list[dict[str, Any]] = []
        for (residue_name, residue_number), atoms in main_residues.items():
            minimum = closest_distance(
                (atom["source"] for atom in atoms if atom["element"] != "H"),
                (atom["source"] for atom in ligand_heavy),
            )
            if minimum <= 5.0:
                pocket_residues.append(
                    {
                        "chainId": "A",
                        "residueName": residue_name,
                        "residueNumber": residue_number,
                        "nearestHeavyAtomDistanceAngstrom": rounded(minimum, 3),
                        "assemblyOperation": 1,
                        "includedInAutoGridScore": True,
                    }
                )
        for operation, residue_name, residue_number in contact_residue_keys:
            matrix = matrices[operation]
            atoms = main_residues[(residue_name, residue_number)]
            minimum = closest_distance(
                (
                    transform_point(atom["source"], matrix)
                    for atom in atoms
                    if atom["element"] != "H"
                ),
                (atom["source"] for atom in ligand_heavy),
            )
            pocket_residues.append(
                {
                    "chainId": operation_chain[operation],
                    "sourceChainId": "A",
                    "residueName": residue_name,
                    "residueNumber": residue_number,
                    "nearestHeavyAtomDistanceAngstrom": rounded(minimum, 3),
                    "assemblyOperation": operation,
                    "includedInAutoGridScore": False,
                }
            )
        pocket_residues.sort(
            key=lambda residue: residue["nearestHeavyAtomDistanceAngstrom"]
        )

        local_waters: list[dict[str, Any]] = []
        for atom in pdb_atoms:
            if atom["residueName"] != "HOH":
                continue
            minimum = closest_distance(
                [atom["source"]], (ligand_atom["source"] for ligand_atom in ligand_heavy)
            )
            if minimum <= 3.5:
                point = recenter(atom["source"], render_origin)
                local_waters.append(
                    {
                        "residueNumber": atom["residueNumber"],
                        "x": point[0],
                        "y": point[1],
                        "z": point[2],
                        "occupancy": atom["occupancy"],
                        "bFactor": atom["bFactor"],
                        "nearestLigandHeavyAtomDistanceAngstrom": rounded(minimum, 3),
                        "excludedFromAutoGridScore": True,
                    }
                )
        local_waters.sort(key=lambda water: water["nearestLigandHeavyAtomDistanceAngstrom"])

        maps: dict[str, list[float]] = {}
        map_validation: dict[str, Any] = {}
        for channel in CHANNELS:
            values, validation = parse_map(sources[f"1stp_protein.{channel}.map"])
            maps[channel] = values
            map_validation[channel] = validation

        # Assign IDs before the scorer emits stable per-atom explanations.
        for atom_id, atom in enumerate(ligand_source):
            atom["id"] = atom_id
        reference_source_positions = [atom["source"] for atom in ligand_source]
        reference_score = score_pose(ligand_source, reference_source_positions, maps)
        translated_score = score_pose(
            ligand_source,
            [[point[0] + 0.5, point[1], point[2]] for point in reference_source_positions],
            maps,
        )
        rotated_15_score = score_pose(
            ligand_source,
            rotate_about_z(reference_source_positions, render_origin, 15),
            maps,
        )
        rotated_20_score = score_pose(
            ligand_source,
            rotate_about_z(reference_source_positions, render_origin, 20),
            maps,
        )
        rotated_30_score = score_pose(
            ligand_source,
            rotate_about_z(reference_source_positions, render_origin, 30),
            maps,
        )
        if reference_score["score"] is None:
            raise ValueError("The deposited reference pose is outside the audited AutoGrid")
        if translated_score["score"] is None or translated_score["score"] <= reference_score["score"]:
            raise ValueError("The audited 0.5 A translation did not worsen the reference score")
        if rotated_15_score["score"] is None or rotated_15_score["score"] <= reference_score["score"]:
            raise ValueError("The audited 15 degree rotation did not worsen the reference score")
        if rotated_20_score["score"] is None or rotated_20_score["score"] <= reference_score["score"]:
            raise ValueError("The audited 20 degree rotation did not worsen the reference score")

        output_dir = args.output_dir.resolve()
        output_dir.mkdir(parents=True, exist_ok=True)
        binary_path = output_dir / "1stp-autogrid.f32"
        with binary_path.open("wb") as handle:
            for channel in CHANNELS:
                for value in maps[channel]:
                    handle.write(struct.pack("<f", value))
        binary_sha = sha256(binary_path)

        channel_bytes = GRID_VALUE_COUNT * 4
        centered_grid_center = recenter(GRID_SOURCE_CENTER, render_origin)
        centered_grid_origin = recenter(source_grid_origin, render_origin)
        grid_manifest = {
            "schemaVersion": "1.0.0",
            "autoGrid": {
                "spacing": GRID_SPACING,
                "dimensions": {
                    "x": GRID_DIMENSIONS[0],
                    "y": GRID_DIMENSIONS[1],
                    "z": GRID_DIMENSIONS[2],
                },
                "center": centered_grid_center,
                "sourceCenter": list(GRID_SOURCE_CENTER),
                "origin": centered_grid_origin,
                "sourceOrigin": [rounded(value) for value in source_grid_origin],
                "coordinateUnits": "angstrom",
                "coordinateFrame": "ligand-heavy-atom-centroid",
                "ordering": {
                    "linearIndex": "x + nx * (y + ny * z)",
                    "axisOrder": ["x", "y", "z"],
                    "xFastest": True,
                },
                "channelOrder": list(CHANNELS),
                "maps": maps,
                "binary": {
                    "url": "/data/1stp-autogrid.f32",
                    "dtype": "float32",
                    "endianness": "little",
                    "layout": "channel-major",
                    "channelOrder": list(CHANNELS),
                    "valuesPerChannel": GRID_VALUE_COUNT,
                    "bytesPerChannel": channel_bytes,
                    "byteOffsets": {
                        channel: index * channel_bytes
                        for index, channel in enumerate(CHANNELS)
                    },
                    "byteLength": binary_path.stat().st_size,
                    "sha256": binary_sha,
                },
                "provenance": {
                    "repository": AUTODOCK_REPO,
                    "commit": AUTODOCK_COMMIT,
                    "path": AUTODOCK_DERIVED_PATH,
                    "sourceFiles": {
                        channel: {
                            "path": f"{AUTODOCK_DERIVED_PATH}/1stp_protein.{channel}.map",
                            "sha256": map_validation[channel]["sourceSha256"],
                        }
                        for channel in CHANNELS
                    },
                    "license": {
                        "id": "GPL-2.0-or-later",
                        "treatment": "conservative-upstream-repository-license",
                        "licenseFile": "/data/LICENSE-AUTODOCK-GPU-GPL-2.0.txt",
                        "note": (
                            "The numerical benchmark files have no per-file license notice. "
                            "SNAP conservatively redistributes them under the AutoDock-GPU "
                            "repository's root GPL-2.0-or-later terms while preserving their 1STP "
                            "CC0 coordinate provenance."
                        ),
                    },
                    "notices": [
                        "Copyright (C) 2017 TU Darmstadt, Embedded Systems and Applications Group, Germany. All rights reserved.",
                        "For some of the code, Copyright (C) 2019 Computational Structural Biology Center, the Scripps Research Institute.",
                        "AutoDock is a Trade Mark of the Scripps Research Institute.",
                        "SNAP is an independent Build Week project and is not affiliated with or endorsed by the AutoDock authors, TU Darmstadt, CCSB Scripps, or the Scripps Research Institute.",
                    ],
                },
                "validation": {
                    "totalValueCount": GRID_VALUE_COUNT * len(CHANNELS),
                    "valuesPerChannel": GRID_VALUE_COUNT,
                    "allFinite": True,
                    "channels": map_validation,
                    "referenceCrystalPose": reference_score,
                    "decoys": {
                        "translatePositiveX0_5Angstrom": translated_score,
                        "rotateZ15Degrees": rotated_15_score,
                        "rotateZ20Degrees": rotated_20_score,
                        "rotateZ30DegreesOutsideGridCheck": rotated_30_score,
                    },
                    "interpretation": (
                        "Lower is more favorable. Values are AutoDock grid-energy terms, "
                        "not an experimental binding affinity or calibrated prediction."
                    ),
                },
            },
        }
        grid_json_path = output_dir / "1stp-autogrid.json"
        grid_json_path.write_text(
            json.dumps(grid_manifest, separators=(",", ":"), allow_nan=False),
            encoding="utf-8",
        )
        runtime_grid_manifest = {
            "schemaVersion": grid_manifest["schemaVersion"],
            "autoGrid": {
                key: value
                for key, value in grid_manifest["autoGrid"].items()
                if key != "maps"
            },
        }
        runtime_grid_json_path = output_dir / "1stp-autogrid-runtime.json"
        runtime_grid_json_path.write_text(
            json.dumps(runtime_grid_manifest, separators=(",", ":"), allow_nan=False),
            encoding="utf-8",
        )

        receptor_heavy = [atom for atom in receptor_source if atom["element"] != "H"]
        ligand_heavy_atoms = [atom for atom in ligand_source if atom["element"] != "H"]
        closest_receptor_ligand = closest_distance(
            (atom["source"] for atom in receptor_heavy),
            (atom["source"] for atom in ligand_heavy_atoms),
        )
        ligand_minimum_heavy_distance = min(
            distance(left["source"], right["source"])
            for index, left in enumerate(ligand_heavy_atoms)
            for right in ligand_heavy_atoms[index + 1 :]
        )
        all_centered = receptor_atoms + ligand_atoms + assembly_contact_atoms
        coordinate_bounds = {
            axis: {
                "minimum": min(atom[axis] for atom in all_centered),
                "maximum": max(atom[axis] for atom in all_centered),
            }
            for axis in ("x", "y", "z")
        }

        provenance = {
            "structure": {
                "provider": "RCSB Protein Data Bank / wwPDB",
                "entryId": PDB_ID,
                "entryUrl": RCSB_ENTRY_URL,
                "entryApiUrl": RCSB_ENTRY_API_URL,
                "coordinateUrl": RCSB_PDB_URL,
                "coordinateSha256": sha256(sources["1STP.pdb"]),
                "structureDoi": "https://doi.org/10.2210/pdb1stp/pdb",
                "publication": {
                    "title": "Structural origins of high-affinity biotin binding to streptavidin.",
                    "authors": [
                        "Weber, P.C.",
                        "Ohlendorf, D.H.",
                        "Wendoloski, J.J.",
                        "Salemme, F.R.",
                    ],
                    "journal": "Science",
                    "year": 1989,
                    "volume": "243",
                    "pages": "85-88",
                    "pubmed": "https://pubmed.ncbi.nlm.nih.gov/2911722/",
                },
                "license": {
                    "id": "CC0-1.0",
                    "url": "https://creativecommons.org/publicdomain/zero/1.0/",
                    "policyUrl": RCSB_USAGE_URL,
                },
            },
            "chemicalComponent": {
                "provider": "RCSB Chemical Component Dictionary",
                "componentId": CCD_ID,
                "apiUrl": RCSB_CCD_API_URL,
                "definitionUrl": RCSB_CCD_URL,
                "definitionSha256": sha256(sources["BTN.cif"]),
                "license": {
                    "id": "CC0-1.0",
                    "policyUrl": RCSB_USAGE_URL,
                },
            },
            "autoDockBenchmark": {
                "provider": "CCSB Scripps AutoDock-GPU",
                "repository": AUTODOCK_REPO,
                "commit": AUTODOCK_COMMIT,
                "path": AUTODOCK_DERIVED_PATH,
                "ligandPdbqtSha256": sha256(sources["1stp_ligand.pdbqt"]),
                "receptorPdbqtSha256": sha256(sources["1stp_protein.pdbqt"]),
                "license": {
                    "id": "GPL-2.0-or-later",
                    "treatment": "conservative-upstream-repository-license",
                    "licenseFile": "/data/LICENSE-AUTODOCK-GPU-GPL-2.0.txt",
                },
                "notices": [
                    "Copyright (C) 2017 TU Darmstadt, Embedded Systems and Applications Group, Germany. All rights reserved.",
                    "For some of the code, Copyright (C) 2019 Computational Structural Biology Center, the Scripps Research Institute.",
                    "AutoDock is a Trade Mark of the Scripps Research Institute.",
                    "SNAP is not affiliated with or endorsed by the AutoDock authors, TU Darmstadt, CCSB Scripps, or the Scripps Research Institute.",
                ],
            },
            "generation": {
                "script": "scripts/prepare_1stp.py",
                "outputs": [
                    "/data/1stp-biotin.json",
                    "/data/1stp-autogrid.json",
                    "/data/1stp-autogrid-runtime.json",
                    "/data/1stp-autogrid.f32",
                ],
            },
        }

        system_manifest = {
            "schemaVersion": "1.0.0",
            "system": {
                "id": "1stp-biotin",
                "name": "Streptavidin + biotin",
                "entryId": PDB_ID,
                "title": "Structural origins of high-affinity biotin binding to streptavidin",
                "description": (
                    "The canonical 1STP X-ray co-crystal, packaged as a client-side "
                    "rigid-pose AutoDock intuition instrument."
                ),
                "method": "X-RAY DIFFRACTION",
                "resolutionAngstrom": 2.6,
                "organism": {
                    "scientificName": "Streptomyces avidinii",
                    "ncbiTaxonomyId": 1895,
                },
                "protein": {
                    "name": "Streptavidin",
                    "depositedChain": "A",
                    "depositedResidueRange": [13, 133],
                    "biologicalAssembly": "tetramer",
                },
                "ligand": {
                    "ccdId": CCD_ID,
                    "name": "BIOTIN",
                    "formula": "C10 H16 N2 O3 S",
                    "formulaWeight": 244.311,
                    "ccdFormalCharge": 0,
                    "preparedChargeState": "deprotonated carboxylate",
                    "pdbqtPartialChargeSum": rounded(
                        sum(atom["partialCharge"] for atom in ligand_source), 3
                    ),
                },
                "visibleProvenance": (
                    "2.6 Å X-ray co-crystal · PDB 1STP · RCSB data CC0 · "
                    "pinned single-chain AutoDock-GPU 1STP benchmark grids"
                ),
                "modelScopeLabel": (
                    "Official AutoDock-GPU prepared single-chain 1STP example; "
                    "not the complete biological pocket"
                ),
                "scope": (
                    "The scored model is the official AutoDock-GPU prepared single-chain "
                    "1STP example. The native tetramer-contact Trp120 copy and nearby "
                    "crystallographic waters are provided only as explicitly unscored context."
                ),
                "limitations": [
                    "Rigid ligand and rigid receptor; no torsional search or energy minimization.",
                    "Precomputed AutoGrid interaction energy is not predictive docking or experimental affinity.",
                    "The official AutoDock-GPU prepared example and maps contain chain A only; the biological tetramer and intersubunit contacts are omitted from scoring.",
                    "The tetramer-contact Trp120 copy is bundled for optional context but explicitly excluded from the AutoGrid energy.",
                    "Implicit-solvent grid terms omit explicit water dynamics and protein conformational change.",
                    "Experimental coordinates contain no hydrogens; the two ligand polar hydrogens and receptor polar hydrogens come from the pinned PDBQT preparation.",
                ],
            },
            "provenance": provenance,
            "frame": {
                "coordinateUnits": "angstrom",
                "coordinateFrame": "ligand-heavy-atom-centroid",
                "renderOriginInSourceFrame": [rounded(value) for value in render_origin],
                "sourceToRenderTranslation": [rounded(-value) for value in render_origin],
                "center": [0.0, 0.0, 0.0],
                "pocketCenter": [0.0, 0.0, 0.0],
                "referenceLigandCentroid": [0.0, 0.0, 0.0],
                "note": (
                    "All atom x/y/z values, reference-pose positions, and AutoGrid "
                    "center/origin values use this same centered frame."
                ),
            },
            "receptor": {
                "chainId": "A",
                "atoms": receptor_atoms,
                "bonds": receptor_bonds,
                "bondMethod": (
                    "Display-only bonds inferred from covalent radii within residues plus "
                    "sequential peptide C-N bonds; scoring uses upstream AutoGrid maps."
                ),
                "assemblyContacts": {
                    "atoms": assembly_contact_atoms,
                    "bonds": assembly_contact_bonds,
                    "excludedFromAutoGridScore": True,
                    "reason": (
                        "1STP's tetramer contributes Trp120 from symmetry operation 3 to "
                        "the native pocket, but the pinned AutoDock benchmark map was built "
                        "from the deposited monomer."
                    ),
                },
            },
            "ligand": {
                "ccdId": CCD_ID,
                "residueName": CCD_ID,
                "residueNumber": 300,
                "chainId": "A",
                "atoms": ligand_atoms,
                "bonds": btn_bonds,
                "referencePose": {
                    "positions": [
                        [atom["x"], atom["y"], atom["z"]] for atom in ligand_atoms
                    ],
                    "experimentalHeavyAtomCount": len(ligand_heavy_atoms),
                    "modeledPolarHydrogenCount": len(ligand_source) - len(ligand_heavy_atoms),
                    "source": (
                        "Heavy atoms preserve the RCSB 1STP co-crystal pose exactly; "
                        "polar-hydrogen coordinates come from the pinned AutoDock-GPU PDBQT."
                    ),
                },
            },
            "pocket": {
                "center": [0.0, 0.0, 0.0],
                "residueCutoffAngstrom": 5.0,
                "interactingResidues": pocket_residues,
                "waters": local_waters,
                "waterCutoffAngstrom": 3.5,
            },
            "scoring": {
                "kind": "AutoDock4-AutoGrid-precomputed-intermolecular-energy",
                "autoGridManifest": "/data/1stp-autogrid-runtime.json",
                "autoGridBinary": "/data/1stp-autogrid.f32",
                "equation": "atomTypeMap + q*electrostaticsMap + abs(q)*desolvationMap",
                "termLabels": [
                    "atom-type affinity",
                    "electrostatics",
                    "desolvation",
                ],
                "interpolation": "trilinear",
                "lowerIsMoreFavorable": True,
                "referencePoseScore": reference_score["score"],
                "interpretation": (
                    "A genuine AutoGrid energy readout for this fixed prepared system, not "
                    "a binding free energy, docking search, or clinical prediction."
                ),
            },
            "validation": {
                "allFinite": True,
                "counts": {
                    "receptorAtoms": len(receptor_atoms),
                    "receptorHeavyAtoms": len(receptor_heavy),
                    "receptorPolarHydrogens": len(receptor_atoms) - len(receptor_heavy),
                    "receptorBonds": len(receptor_bonds),
                    "ligandAtoms": len(ligand_atoms),
                    "ligandHeavyAtoms": len(ligand_heavy_atoms),
                    "ligandPolarHydrogens": len(ligand_atoms) - len(ligand_heavy_atoms),
                    "ligandBonds": len(btn_bonds),
                    "assemblyContactAtoms": len(assembly_contact_atoms),
                    "assemblyContactResidues": len(contact_residue_keys),
                    "nearbyCrystallographicWaters": len(local_waters),
                },
                "coordinateChecks": {
                    "maximumReceptorHeavyAtomPdbVsPdbqtDeltaAngstrom": rounded(
                        max(receptor_coordinate_deltas)
                    ),
                    "maximumLigandHeavyAtomPdbVsPdbqtDeltaAngstrom": rounded(
                        max(ligand_coordinate_deltas)
                    ),
                    "closestReceptorLigandHeavyAtomDistanceAngstrom": rounded(
                        closest_receptor_ligand, 3
                    ),
                    "minimumLigandHeavyAtomDistanceAngstrom": rounded(
                        ligand_minimum_heavy_distance, 3
                    ),
                    "coordinateBounds": coordinate_bounds,
                },
                "chargeChecks": {
                    "receptorPartialChargeSum": rounded(
                        sum(atom["partialCharge"] for atom in receptor_source), 3
                    ),
                    "ligandPartialChargeSum": rounded(
                        sum(atom["partialCharge"] for atom in ligand_source), 3
                    ),
                },
                "gridChecks": {
                    "dimensions": list(GRID_DIMENSIONS),
                    "valuesPerChannel": GRID_VALUE_COUNT,
                    "channels": len(CHANNELS),
                    "totalValues": GRID_VALUE_COUNT * len(CHANNELS),
                    "referenceCrystalPoseScore": reference_score["score"],
                    "translated0_5AngstromScore": translated_score["score"],
                    "rotated15DegreesScore": rotated_15_score["score"],
                    "rotated20DegreesScore": rotated_20_score["score"],
                    "rotated30DegreesInsideGrid": rotated_30_score["insideGrid"],
                    "crystalPoseBeatsAuditedInGridDecoys": True,
                },
            },
        }

        manifest_path = output_dir / "1stp-biotin.json"
        manifest_path.write_text(
            json.dumps(system_manifest, indent=2, allow_nan=False) + "\n",
            encoding="utf-8",
        )
        license_output = output_dir / "LICENSE-AUTODOCK-GPU-GPL-2.0.txt"
        license_output.write_bytes(sources["LICENSE"].read_bytes())
        attribution_path = output_dir / "THIRD_PARTY_DATA.md"
        attribution_path.write_text(
            "# Third-party scientific data\n\n"
            "## RCSB PDB / wwPDB 1STP and BTN\n\n"
            "The deposited 1STP coordinates and BTN Chemical Component Dictionary data "
            "are provided by the RCSB Protein Data Bank/wwPDB under CC0 1.0. SNAP "
            "preserves PDB ID, DOI, publication citation, source URLs, and source hashes "
            "inside `1stp-biotin.json`.\n\n"
            f"Usage policy: {RCSB_USAGE_URL}\n\n"
            "## AutoDock-GPU 1STP benchmark\n\n"
            "The PDBQT atom types/partial charges and AutoGrid map values are redistributed "
            "from the official CCSB Scripps AutoDock-GPU repository at commit "
            f"`{AUTODOCK_COMMIT}`, path `{AUTODOCK_DERIVED_PATH}`. The numerical files "
            "have no per-file license notice, so SNAP conservatively treats them under the "
            "repository's root GPL-2.0-or-later terms. A verbatim copy is included as "
            "`LICENSE-AUTODOCK-GPU-GPL-2.0.txt`.\n\n"
            "Copyright (C) 2017 TU Darmstadt, Embedded Systems and Applications Group, Germany. "
            "All rights reserved. For some of the code, Copyright (C) 2019 Computational "
            "Structural Biology Center, the Scripps Research Institute. AutoDock is a Trade "
            "Mark of the Scripps Research Institute. SNAP is an independent Build Week project "
            "and is not affiliated with or endorsed by the AutoDock authors, TU Darmstadt, "
            "CCSB Scripps, or the Scripps Research Institute.\n\n"
            f"Repository: {AUTODOCK_REPO}\n",
            encoding="utf-8",
        )

        return {
            "manifest": str(manifest_path),
            "gridManifest": str(grid_json_path),
            "runtimeGridManifest": str(runtime_grid_json_path),
            "gridBinary": str(binary_path),
            "gridBinarySha256": binary_sha,
            "attribution": str(attribution_path),
            "validation": system_manifest["validation"],
        }


def main() -> None:
    args = parse_args()
    result = build(args)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
