"""Reproduce the visually localized study points; does not detect landmarks.

Vertex selections were inspected in anterior, lateral and superior projections.
They are approximate atlas localizations, not independent clinical validation.
S is a free-space estimate within the sella; Gn is the Me/Pog midpoint.
"""
from pathlib import Path
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parents[1]


def vertex(bone, index):
    path = ROOT / 'meshes' / 'skull' / (bone + '.glb')
    raw = path.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20 + length])
    accessor = gltf['accessors'][gltf['meshes'][0]['primitives'][0]['attributes']['POSITION']]
    view = gltf['bufferViews'][accessor['bufferView']]
    offset = 28 + length + view.get('byteOffset', 0) + accessor.get('byteOffset', 0) + index * view.get('byteStride', 12)
    return list(struct.unpack_from('<fff', raw, offset))


def point(code, bone, index, side=None):
    mesh = 'meshes/skull/' + bone + '.glb'
    value = dict(code=code, parts=['skull:' + bone], position=vertex(bone, index), kind='surface',
                 evidence=dict(status='visual-localization', mesh=mesh, vertexIndex=index,
                               meshSha256=hashlib.sha256((ROOT / mesh).read_bytes()).hexdigest()))
    if side:
        value['side'] = side
    return value


def build():
    me = point('Me', 'mandible', 5469)
    pog = point('Pog', 'mandible', 5092)
    records = [
        ('S', 'Sella', 'Centre of the sella turcica (pituitary fossa) in the sphenoid bone.',
         'An estimated centre within the fossa, not a point on its bony floor. The marker is visible through the skull.',
         [dict(code='S', parts=['skull:sphenoid_bone'], position=[-0.7, -118.5, 1533.5], kind='constructed',
               evidence=dict(status='approximate-construction', method='Visual estimate of the fossa centre between its anterior and posterior walls; no surface snapping.'))]),
        ('N', 'Nasion', 'Midline junction of the frontal and nasal bones at the frontonasal suture.',
         'Look at the root of the nose. This is a bony landmark, not the soft-tissue depression.',
         [point('N', 'nasal_bone_left', 206)]),
        ('Or', 'Orbitale', 'Lowest point on the inferior bony margin of each orbit.',
         'Use the orbital rim, not the infraorbital foramen below it. Left and right are separate points.',
         [point('Or-L', 'maxilla_left', 5631, 'left'), point('Or-R', 'maxilla_right', 676, 'right')]),
        ('Po', 'Porion', 'Uppermost point on the external bony margin of the external auditory meatus.',
         'Identify the ear-canal roof in the temporal bone. This is anatomical porion, not an ear-rod reference.',
         [point('Po-L', 'temporal_bone_left', 4024, 'left'), point('Po-R', 'temporal_bone_right', 1291, 'right')]),
        ('ANS', 'Anterior nasal spine', 'Tip of the anterior nasal spine at the lower border of the nasal aperture.',
         'The two maxillae contribute to this midline projection. Follow the nasal floor forwards to its tip.',
         [point('ANS', 'maxilla_left', 207)]),
        ('PNS', 'Posterior nasal spine', 'Posterior midline tip of the bony hard palate.',
         'The posterior nasal spine is formed by the horizontal plates of the palatine bones. It is not a posterior process of the maxilla.',
         [point('PNS', 'palatine_bone_left', 256)]),
        ('Go', 'Gonion', 'Posteroinferior region of the mandibular angle where the ramus meets the body.',
         'These marks localize the left and right bony angles. Some 2D analyses construct Go with tangents and an angle bisector; that construction is not performed here.',
         [point('Go-L', 'mandible', 9652, 'left'), point('Go-R', 'mandible', 1464, 'right')]),
        ('Me', 'Menton', 'Lowest point of the mandibular symphysis in the midline.',
         'Find the inferior edge of the bony chin. Menton describes the lowest point, rather than the most forward point.', [me]),
        ('Pog', 'Pogonion', 'Most anterior point on the bony chin at the mandibular symphysis.',
         'Follow the anterior chin contour below point B. Do not confuse it with the incisor-bearing alveolar process.', [pog]),
        ('Gn', 'Gnathion', 'Constructed midpoint between Menton and Pogonion, following your reference.',
         'The marker uses the arithmetic midpoint of this model’s Me and Pog coordinates. Other analyses use a contour or tangent-based definition; this midpoint need not lie on the bone surface.',
         [dict(code='Gn', parts=['skull:mandible'], position=[(a + b) / 2 for a, b in zip(me['position'], pog['position'])], kind='constructed',
               evidence=dict(status='approximate-construction', method='Arithmetic midpoint of Me and Pog.', derivedFrom=['Me', 'Pog']))]),
        ('A', 'Point A · Subspinale', 'Deepest point of the anterior maxillary concavity between ANS and the alveolar crest.',
         'Trace the midline bony profile below the anterior nasal spine and above the upper incisor sockets.',
         [point('A', 'maxilla_left', 256)]),
        ('B', 'Point B · Supramentale', 'Deepest point of the anterior mandibular concavity between the alveolar crest and Pogonion.',
         'Trace the midline contour below the lower incisor sockets and above the prominence of the chin.',
         [point('B', 'mandible', 5203)]),
    ]
    # Midline interfaces require both contributing halves; do not leave a mark
    # floating when a user hides one of its supporting structures.
    dependencies = {'N': ['skull:frontal_bone', 'skull:nasal_bone_right'],
                    'ANS': ['skull:maxilla_right'], 'A': ['skull:maxilla_right'],
                    'PNS': ['skull:palatine_bone_right']}
    landmarks = []
    for code, name, definition, note, points in records:
        for p in points:
            p['parts'].extend(dependencies.get(code, []))
        landmarks.append(dict(id=code, name=name, definition=definition, note=note, points=points))
    result = dict(
        coordinateSpace='atlas-local',
        placementStatus='Approximate study localizations; not expert-validated measurements.',
        placementMethod='Manual visual inspection of this mesh version in anterior, lateral and superior projections. Surface records retain the selected vertex and mesh hash. S and Gn are explicitly constructed.',
        sources=[
            dict(title='3D landmark definitions and reproducibility (2021)', url='https://www.mdpi.com/2077-0383/10/22/5303'),
            dict(title='3D cephalometric protocol and Gn midpoint definition (2019)', url='https://pmc.ncbi.nlm.nih.gov/articles/PMC6525456/'),
            dict(title='Cephalometric landmark identification in 2D and 3D (2009)', url='https://pmc.ncbi.nlm.nih.gov/articles/PMC2753840/'),
            dict(title='Palatine bones and posterior nasal spine · University of Baghdad', url='https://codental.uobaghdad.edu.iq/wp-content/uploads/sites/14/2020/05/lec-5-first-year.pdf'),
        ], landmarks=landmarks)
    (ROOT / 'data' / 'cephalometry.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


if __name__ == '__main__':
    build()
