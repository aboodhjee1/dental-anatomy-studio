# Conversion script used to build meshes/skull/*.glb from BodyParts3D STL files.
# Requires: python -m pip install trimesh
# Usage: python scripts/convert_stl_to_glb.py --source PATH_TO_STL_FOLDER

import argparse
import os
from pathlib import Path
import trimesh

parser = argparse.ArgumentParser(description="Convert BodyParts3D skull STLs to GLB.")
parser.add_argument("--source", type=Path, required=True, help="BodyParts3D STL source folder")
parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "meshes" / "skull")
args = parser.parse_args()
SRC = args.source.resolve()
DST = args.output.resolve()

bones = {
    "frontal_bone": "FMA52734",
    "occipital_bone": "FMA52735",
    "sphenoid_bone": "FMA52736",
    "ethmoid_bone": "FMA52740",
    "vomer": "FMA9710",
    "mandible": "FMA52748",
    "parietal_bone_right": "FMA52788",
    "parietal_bone_left": "FMA52789",
    "temporal_bone_right": "FMA52738",
    "temporal_bone_left": "FMA52739",
    "zygomatic_bone_right": "FMA52892",
    "zygomatic_bone_left": "FMA52893",
    "lacrimal_bone_right": "FMA53645",
    "lacrimal_bone_left": "FMA53646",
    "nasal_bone_right": "FMA53647",
    "nasal_bone_left": "FMA53648",
    "maxilla_right": "FMA53649",
    "maxilla_left": "FMA53650",
    "palatine_bone_right": "FMA53655",
    "palatine_bone_left": "FMA53656",
    "inferior_nasal_concha_right": "FMA54737",
    "inferior_nasal_concha_left": "FMA54738",
}

missing = [str(SRC / f"{fma}.stl") for fma in bones.values() if not (SRC / f"{fma}.stl").is_file()]
if missing:
    parser.error("Missing source meshes: " + ", ".join(missing))
DST.mkdir(parents=True, exist_ok=True)
results = []
for name, fma in bones.items():
    src_path = os.path.join(SRC, f"{fma}.stl")
    dst_path = os.path.join(DST, f"{name}.glb")
    mesh = trimesh.load(src_path, force='mesh')
    # normalize: BodyParts3D units are mm; keep as-is but center scene later in JS
    mesh.export(dst_path)
    size_kb = os.path.getsize(dst_path) / 1024
    results.append((name, fma, round(size_kb,1), mesh.vertices.shape[0], mesh.faces.shape[0]))

for r in results:
    print(r)
