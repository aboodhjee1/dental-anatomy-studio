"""Rebuild sourced salivary and dental-reference meshes. Requires numpy."""
from pathlib import Path
import hashlib
import json
import re
import numpy as np
from import_nerves import read_obj, export_glb

ROOT = Path(__file__).resolve().parents[1]


def read_vtk(path):
    data = path.read_bytes()
    match = re.search(rb'POINTS (\d+) float\n', data)
    count = int(match[1])
    vertices = np.frombuffer(data, dtype='>f4', count=count * 3, offset=match.end()).reshape(-1, 3).astype(float)
    strips = re.search(rb'TRIANGLE_STRIPS (\d+) (\d+)\n', data[match.end() + count * 12:])
    start = match.end() + count * 12 + strips.end()
    values = np.frombuffer(data, dtype='>i4', count=int(strips[2]), offset=start)
    faces, cursor = [], 0
    for _ in range(int(strips[1])):
        length = int(values[cursor]); strip = values[cursor + 1:cursor + 1 + length]
        for i in range(length - 2):
            face = [strip[i], strip[i + 1], strip[i + 2]]
            if i % 2: face[0], face[1] = face[1], face[0]
            if len(set(face)) == 3: faces.append(face)
        cursor += length + 1
    return vertices, np.asarray(faces, dtype=np.uint32)


def main():
    source = ROOT / 'sources/salivary'
    manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    for part_id, entry in manifest['parts'].items():
        path = source / entry['file']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256']
        is_spl = path.suffix == '.vtk'
        vertices, faces = read_vtk(path) if is_spl else read_obj(path)
        reg = json.loads((ROOT / 'data' / ('parotid_registration.json' if is_spl else 'nerve_registration.json')).read_text())
        if is_spl:
            vertices = (vertices * reg['preRotation']) @ np.asarray(reg['rotationRowVector'])
        vertices = vertices * reg['scale'] + np.asarray(reg['translation'])
        extras = {**entry, 'geometryType': 'source atlas mesh', 'registration': reg,
                  'modifications': 'Source surface retained; converted to GLB, computed normals, common similarity transform. Parotids are an approximate overlay from a different specimen.'}
        (ROOT / 'meshes/salivary' / (part_id + '.glb')).write_bytes(export_glb(vertices, faces, extras))
    print(f"Converted {len(manifest['parts'])} salivary and reference meshes.")


if __name__ == '__main__':
    main()
