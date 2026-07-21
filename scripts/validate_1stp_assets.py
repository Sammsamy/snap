#!/usr/bin/env python3
"""Independently validate SNAP's generated 1STP browser assets."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from pathlib import Path
from typing import Any, Sequence


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "public" / "data",
    )
    return parser.parse_args()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_close(actual: float, expected: float, tolerance: float, label: str) -> None:
    if abs(actual - expected) > tolerance:
        raise AssertionError(
            f"{label}: expected {expected} +/- {tolerance}, found {actual}"
        )


def validate_atom_block(block: dict[str, Any], label: str) -> None:
    atoms = block["atoms"]
    expected_ids = list(range(len(atoms)))
    actual_ids = [atom["id"] for atom in atoms]
    if actual_ids != expected_ids:
        raise AssertionError(f"{label}: atom IDs are not contiguous numeric IDs")
    for atom in atoms:
        for axis in ("x", "y", "z"):
            if not math.isfinite(atom[axis]):
                raise AssertionError(f"{label}: non-finite {axis} coordinate")
        if not math.isfinite(atom["partialCharge"]):
            raise AssertionError(f"{label}: non-finite partial charge")
    valid_ids = set(expected_ids)
    for bond in block["bonds"]:
        if not isinstance(bond["a"], int) or not isinstance(bond["b"], int):
            raise AssertionError(f"{label}: bond endpoints must be numeric")
        if bond["a"] not in valid_ids or bond["b"] not in valid_ids:
            raise AssertionError(f"{label}: bond endpoint is outside the atom array")
        if bond["a"] == bond["b"]:
            raise AssertionError(f"{label}: self-bond found")


def trilinear(
    values: Sequence[float],
    point: Sequence[float],
    origin: Sequence[float],
    spacing: float,
    dimensions: tuple[int, int, int],
) -> float | None:
    nx, ny, nz = dimensions
    gx, gy, gz = [(point[i] - origin[i]) / spacing for i in range(3)]
    if not (0 <= gx < nx - 1 and 0 <= gy < ny - 1 and 0 <= gz < nz - 1):
        return None
    x0, y0, z0 = math.floor(gx), math.floor(gy), math.floor(gz)
    dx, dy, dz = gx - x0, gy - y0, gz - z0
    result = 0.0
    for z, wz in ((z0, 1 - dz), (z0 + 1, dz)):
        for y, wy in ((y0, 1 - dy), (y0 + 1, dy)):
            for x, wx in ((x0, 1 - dx), (x0 + 1, dx)):
                index = x + nx * (y + ny * z)
                result += values[index] * wx * wy * wz
    return result


def score(
    atoms: Sequence[dict[str, Any]],
    maps: dict[str, Sequence[float]],
    grid: dict[str, Any],
    translation: Sequence[float] = (0.0, 0.0, 0.0),
) -> float:
    dimensions = tuple(grid["dimensions"][axis] for axis in ("x", "y", "z"))
    total = 0.0
    for atom in atoms:
        point = [atom[axis] + translation[index] for index, axis in enumerate(("x", "y", "z"))]
        affinity = trilinear(
            maps[atom["autodockType"]],
            point,
            grid["origin"],
            grid["spacing"],
            dimensions,
        )
        electrostatics = trilinear(
            maps["e"], point, grid["origin"], grid["spacing"], dimensions
        )
        desolvation = trilinear(
            maps["d"], point, grid["origin"], grid["spacing"], dimensions
        )
        if None in (affinity, electrostatics, desolvation):
            raise AssertionError("Reference atom unexpectedly outside AutoGrid")
        charge = atom["partialCharge"]
        total += affinity + charge * electrostatics + abs(charge) * desolvation
    return total


def main() -> None:
    data_dir = parse_args().data_dir.resolve()
    system_path = data_dir / "1stp-biotin.json"
    grid_path = data_dir / "1stp-autogrid.json"
    runtime_grid_path = data_dir / "1stp-autogrid-runtime.json"
    binary_path = data_dir / "1stp-autogrid.f32"
    system = json.loads(system_path.read_text(encoding="utf-8"))
    grid_manifest = json.loads(grid_path.read_text(encoding="utf-8"))
    grid = grid_manifest["autoGrid"]
    runtime_grid = json.loads(runtime_grid_path.read_text(encoding="utf-8"))["autoGrid"]

    if "maps" in runtime_grid:
        raise AssertionError("Runtime AutoGrid manifest must not duplicate JSON map values")
    for key in ("spacing", "dimensions", "center", "origin", "channelOrder", "binary"):
        if runtime_grid[key] != grid[key]:
            raise AssertionError(f"Runtime AutoGrid metadata mismatch for {key}")
    if system["scoring"]["autoGridManifest"] != "/data/1stp-autogrid-runtime.json":
        raise AssertionError("System does not point at the compact runtime manifest")

    validate_atom_block(system["receptor"], "receptor")
    validate_atom_block(system["ligand"], "ligand")
    validate_atom_block(system["receptor"]["assemblyContacts"], "assemblyContacts")

    ligand_heavy = [
        atom for atom in system["ligand"]["atoms"] if atom["element"] != "H"
    ]
    for axis in ("x", "y", "z"):
        heavy_centroid = sum(atom[axis] for atom in ligand_heavy) / len(ligand_heavy)
        assert_close(heavy_centroid, 0.0, 1e-6, f"ligand heavy centroid {axis}")

    dimensions = tuple(grid["dimensions"][axis] for axis in ("x", "y", "z"))
    values_per_channel = math.prod(dimensions)
    if dimensions != (25, 23, 33) or values_per_channel != 18_975:
        raise AssertionError(f"Unexpected grid dimensions: {dimensions}")
    channel_order = grid["channelOrder"]
    if channel_order != ["A", "C", "OA", "N", "SA", "HD", "e", "d"]:
        raise AssertionError(f"Unexpected channel order: {channel_order}")
    for channel in channel_order:
        values = grid["maps"][channel]
        if len(values) != values_per_channel:
            raise AssertionError(f"{channel}: wrong map length")
        if not all(math.isfinite(value) for value in values):
            raise AssertionError(f"{channel}: non-finite map value")

    binary = binary_path.read_bytes()
    expected_binary_length = values_per_channel * len(channel_order) * 4
    if len(binary) != expected_binary_length:
        raise AssertionError("AutoGrid binary has the wrong byte length")
    if sha256(binary_path) != grid["binary"]["sha256"]:
        raise AssertionError("AutoGrid binary SHA-256 mismatch")
    unpacked = struct.unpack(f"<{values_per_channel * len(channel_order)}f", binary)
    maximum_binary_delta = 0.0
    for channel_index, channel in enumerate(channel_order):
        start = channel_index * values_per_channel
        binary_values = unpacked[start : start + values_per_channel]
        maximum_binary_delta = max(
            maximum_binary_delta,
            max(
                abs(left - right)
                for left, right in zip(binary_values, grid["maps"][channel])
            ),
        )
    if maximum_binary_delta > 0.01:
        raise AssertionError(f"JSON/binary map delta is too large: {maximum_binary_delta}")

    reference_score = score(system["ligand"]["atoms"], grid["maps"], grid)
    translated_score = score(
        system["ligand"]["atoms"], grid["maps"], grid, translation=(0.5, 0.0, 0.0)
    )
    assert_close(
        reference_score,
        system["scoring"]["referencePoseScore"],
        1e-5,
        "reference crystal-pose score",
    )
    assert_close(
        translated_score,
        system["validation"]["gridChecks"]["translated0_5AngstromScore"],
        1e-5,
        "translated decoy score",
    )
    if reference_score >= translated_score:
        raise AssertionError("Crystal pose did not beat translated decoy")

    if "not the complete biological pocket" not in system["system"]["modelScopeLabel"]:
        raise AssertionError("Single-chain scope disclosure is missing")
    if system["provenance"]["autoDockBenchmark"]["license"]["id"] != "GPL-2.0-or-later":
        raise AssertionError("AutoDock-GPU license identifier is missing or incorrect")

    result = {
        "ok": True,
        "systemSha256": sha256(system_path),
        "gridManifestSha256": sha256(grid_path),
        "runtimeGridManifestSha256": sha256(runtime_grid_path),
        "gridBinarySha256": sha256(binary_path),
        "counts": system["validation"]["counts"],
        "grid": {
            "dimensions": dimensions,
            "channels": len(channel_order),
            "valuesPerChannel": values_per_channel,
            "totalValues": values_per_channel * len(channel_order),
            "maximumJsonVsFloat32Delta": maximum_binary_delta,
        },
        "scores": {
            "referenceCrystalPose": reference_score,
            "translated0_5Angstrom": translated_score,
        },
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
