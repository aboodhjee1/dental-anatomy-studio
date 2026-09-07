"""Convert the included BodyParts3D 4.3 nerve OBJs without redrawing anatomy.

Requires numpy. Source vertices and faces are retained; only the documented
uniform registration transform and computed vertex normals are applied.
"""
from pathlib import Path
import hashlib
import json
import struct
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'sources' / 'bodyparts3d'


def read_obj(file):
    vertices, faces = [], []
    for line in file.read_text().splitlines():
        columns = line.split()
        if not columns:
            continue
        if columns[0] == 'v':
            vertices.append([float(value) for value in columns[1:4]])
        elif columns[0] == 'f':
            indices = [int(value.split('/')[0]) for value in columns[1:]]
            indices = [value - 1 if value > 0 else len(vertices) + value for value in indices]
            for index in range(1, len(indices) - 1):
                faces.append([indices[0], indices[index], indices[index + 1]])
    return np.asarray(vertices, dtype=np.float64), np.asarray(faces, dtype=np.uint32)


def export_glb(vertices, faces, extras):
    vertices = vertices.astype('<f4')
    normals = np.zeros_like(vertices)
    triangles = vertices[faces]
    face_normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    for corner in range(3):
        np.add.at(normals, faces[:, corner], face_normals)
    lengths = np.linalg.norm(normals, axis=1)
    normals /= np.maximum(lengths[:, None], 1e-10)
    arrays = [vertices.tobytes(), normals.astype('<f4').tobytes(), faces.astype('<u4').tobytes()]
    binary = b''.join(arrays)
    document = {
        'asset': {'version': '2.0', 'generator': 'BodyParts3D source mesh converter'},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2}]}],
        'buffers': [{'byteLength': len(binary)}],
        'bufferViews': [
            {'buffer': 0, 'byteOffset': 0, 'byteLength': len(arrays[0]), 'target': 34962},
            {'buffer': 0, 'byteOffset': len(arrays[0]), 'byteLength': len(arrays[1]), 'target': 34962},
            {'buffer': 0, 'byteOffset': len(arrays[0]) + len(arrays[1]), 'byteLength': len(arrays[2]), 'target': 34963},
        ],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': len(vertices), 'type': 'VEC3', 'min': vertices.min(0).tolist(), 'max': vertices.max(0).tolist()},
            {'bufferView': 1, 'componentType': 5126, 'count': len(vertices), 'type': 'VEC3'},
            {'bufferView': 2, 'componentType': 5125, 'count': faces.size, 'type': 'SCALAR'},
        ],
        'extras': extras,
    }
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    return (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary))
            + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
            + struct.pack('<II', len(binary), 0x004e4942) + binary)


def main():
    manifest = json.loads((SOURCE / 'manifest.json').read_text(encoding='utf8'))
    registration = json.loads((ROOT / 'data/nerve_registration.json').read_text())
    for part_id, entry in manifest['parts'].items():
        source = SOURCE / entry['file']
        if hashlib.sha256(source.read_bytes()).hexdigest() != entry['sha256']:
            raise ValueError(f'Source hash mismatch: {source.name}')
        vertices, faces = read_obj(source)
        vertices = vertices * registration['scale'] + np.array(registration['translation'])
        extras = {
            'dataset': 'BodyParts3D', 'version': '4.3', 'geometryType': 'source atlas mesh',
            'sourceFileId': entry['fileId'], 'sourceFmaId': entry['fmaId'],
            'sourceSha256': entry['sha256'], 'license': manifest['license'],
            'attribution': manifest['attribution'],
            'registration': {'scale': registration['scale'], 'translation': registration['translation']},
            'modifications': 'Uniform scale and translation; vertex normals computed. No resculpting, mirroring, or artificial thickening.',
        }
        destination = ROOT / 'meshes/nerves' / f'{part_id}.glb'
        destination.write_bytes(export_glb(vertices, faces, extras))
    print(f"Converted {len(manifest['parts'])} sourced nerve meshes.")


if __name__ == '__main__':
    main()
