import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { Viewer } from '../js/viewer.js';
import { normalizeContent } from '../js/loader.js';

function fixture() {
  const viewer = Object.create(Viewer.prototype);
  viewer.parts = new Map();
  viewer.layerOpacity = new Map();
  viewer.contentGroup = new THREE.Group();
  viewer.pointer = new THREE.Vector2();
  viewer.raycaster = new THREE.Raycaster();
  viewer.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  viewer.camera.position.z = 10;
  viewer.camera.updateMatrixWorld();
  const handlers = new Map();
  viewer.renderer = { domElement: { style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), addEventListener: (name, fn) => handlers.set(name, fn) } };
  viewer.handlers = handlers;
  viewer.fit = () => {};
  for (const [id, z, visible] of [['front', 2, true], ['back', 0, true], ['hidden', 4, false]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.userData.partId = id;
    const object3D = new THREE.Group();
    object3D.position.z = z;
    object3D.visible = visible;
    object3D.add(mesh);
    viewer.contentGroup.add(object3D);
    viewer.parts.set(id, { object3D, visible, materials: [{ mesh, material: mesh.material }], sourceUrl: `${id}.glb`, layerId: id === 'back' ? 'nerve' : 'bone', explode: true, originalPosition: object3D.position.clone(), explodeOffset: new THREE.Vector3(5, 1, 0) });
  }
  viewer.contentGroup.updateMatrixWorld(true);
  return viewer;
}

test('Every registered mesh exists and GLB geometry has valid ranges and finite positions', async () => {
  const registry = JSON.parse(await fs.readFile(new URL('../data/layers.json', import.meta.url)));
  let count = 0;
  for (const layer of registry.layers) {
    const content = normalizeContent(JSON.parse(await fs.readFile(new URL('../' + layer.contentFile, import.meta.url))), layer);
    for (const entry of Object.values(content.parts)) {
      const buffer = await fs.readFile(new URL(`../${layer.meshFolder}/${entry.mesh}`, import.meta.url));
      if (entry.mesh.endsWith('.glb')) {
        assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
        assert.equal(buffer.readUInt32LE(4), 2);
        assert.equal(buffer.readUInt32LE(8), buffer.length);
        const length = buffer.readUInt32LE(12);
        const gltf = JSON.parse(buffer.toString('utf8', 20, 20 + length));
        const binStart = 28 + length;
        for (const view of gltf.bufferViews) assert.ok(binStart + (view.byteOffset || 0) + view.byteLength <= buffer.length);
        for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
          const accessor = gltf.accessors[primitive.attributes.POSITION];
          const view = gltf.bufferViews[accessor.bufferView];
          assert.ok(accessor.count > 0);
          assert.equal(accessor.componentType, 5126);
          const start = binStart + (view.byteOffset || 0) + (accessor.byteOffset || 0);
          for (let i = 0; i < accessor.count; i++) for (let axis = 0; axis < 3; axis++) assert.ok(Number.isFinite(buffer.readFloatLE(start + i * (view.byteStride || 12) + axis * 4)));
        }
        if (layer.studyType === 'nerve') {
          assert.equal(gltf.extras.geometryType, 'source atlas mesh');
          assert.equal(gltf.extras.sourceFileId, entry.sourceMesh.fileId);
          assert.ok(entry.sources.length);
        }
      } else assert.equal(84 + buffer.readUInt32LE(80) * 50, buffer.length);
      count++;
    }
  }
  assert.equal(count, 64);
});

test('Nerve GLBs preserve every source vertex and face under a single shared registration', async () => {
  const sourceRoot = new URL('../sources/bodyparts3d/', import.meta.url);
  const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', sourceRoot)));
  const mapping = (await fs.readFile(new URL('FMA2Obj-excerpt.txt', sourceRoot), 'utf8')).split(/\r?\n/);
  const registration = JSON.parse(await fs.readFile(new URL('../data/nerve_registration.json', import.meta.url)));
  assert.equal(Object.keys(manifest.parts).length, 26);
  const fileIds = new Set();
  for (const [id, source] of Object.entries(manifest.parts)) {
    assert.ok(mapping.some(line => {
      const columns = line.split('\t');
      return columns[0] === source.fmaId && columns[2]?.split('+').includes(source.fileId);
    }), `${id}: identity matches the official 4.3 FMA/component mapping`);
    const obj = await fs.readFile(new URL(source.file, sourceRoot));
    assert.equal(createHash('sha256').update(obj).digest('hex'), source.sha256);
    const vertices = [], indices = [];
    for (const line of obj.toString().split(/\r?\n/)) {
      if (line.startsWith('v ')) vertices.push(line.trim().split(/\s+/).slice(1, 4).map(Number));
      if (line.startsWith('f ')) {
        const face = line.trim().split(/\s+/).slice(1).map(token => Number(token.split('/')[0]) - 1);
        for (let i = 1; i < face.length - 1; i++) indices.push(face[0], face[i], face[i + 1]);
      }
    }
    const binary = await fs.readFile(new URL(`../meshes/nerves/${id}.glb`, import.meta.url));
    const jsonLength = binary.readUInt32LE(12);
    const gltf = JSON.parse(binary.toString('utf8', 20, 20 + jsonLength));
    const access = gltf.accessors[0], view = gltf.bufferViews[access.bufferView];
    assert.equal(access.count, vertices.length);
    const start = 28 + jsonLength + (view.byteOffset || 0);
    vertices.forEach((vertex, i) => vertex.forEach((value, axis) => {
      const expected = Math.fround(value * registration.scale + registration.translation[axis]);
      assert.equal(binary.readFloatLE(start + (i * 3 + axis) * 4), expected, `${id}: source vertex ${i}, axis ${axis}`);
    }));
    const indexAccess = gltf.accessors[2], indexView = gltf.bufferViews[indexAccess.bufferView];
    assert.equal(indexAccess.count, indices.length);
    indices.forEach((value, i) => assert.equal(binary.readUInt32LE(28 + jsonLength + indexView.byteOffset + i * 4), value));
    assert.deepEqual(gltf.extras.registration, { scale: registration.scale, translation: registration.translation });
    assert.equal(gltf.extras.sourceSha256, source.sha256);
    assert.ok(!fileIds.has(source.fileId), 'Left and right must use independent source objects');
    fileIds.add(source.fileId);
  }
  const files = (await fs.readdir(new URL('../meshes/nerves/', import.meta.url))).filter(name => name.endsWith('.glb'));
  assert.equal(files.length, 26, 'No rejected schematic meshes remain in the active layer');
  for (const bone of manifest.referenceBones) {
    const source = await fs.readFile(new URL(bone.file, sourceRoot));
    assert.equal(createHash('sha256').update(source).digest('hex'), bone.sha256);
    const target = await fs.readFile(new URL('../' + bone.target, import.meta.url));
    assert.equal(createHash('sha256').update(target).digest('hex'), bone.targetSha256, 'Re-register if the skull changes');
  }
  for (const bone of registration.referenceBones) {
    assert.ok(bone.rmsNearestVertexMm < 0.5, `${bone.name} alignment RMS`);
    assert.ok(bone.p95Mm < 1, `${bone.name} alignment p95`);
  }
});

test('Content normalizer ignores annotations even when they precede the parts map', () => {
  const parts = { example: { displayName: 'Example', mesh: 'example.glb' } };
  assert.deepEqual(normalizeContent({ annotations: { example: [] }, bones: parts }, { partsKey: 'bones' }).parts, parts);
  assert.throws(() => normalizeContent({ annotations: {} }, { partsKey: 'bones' }), /No parts map/);
});

test('Picking excludes hidden ancestors and does not throw for a hit or background', () => {
  const viewer = fixture(), calls = [];
  viewer.onPartClick = id => calls.push(id);
  viewer._handlePointer({ clientX: 50, clientY: 50 }, 'click');
  viewer._handlePointer({ clientX: 0, clientY: 0 }, 'click');
  assert.deepEqual(calls, ['front', null]);
  assert.equal(viewer.renderer.domElement.style.cursor, 'grab');
});

test('Transparent context can be picked through, and annotation objects cannot intercept', () => {
  const viewer = fixture();
  viewer.setLayerOpacity('bone', 0.16);
  const annotation = new THREE.Mesh(new THREE.SphereGeometry(2), new THREE.MeshBasicMaterial());
  annotation.position.z = 6;
  viewer.contentGroup.add(annotation);
  viewer.contentGroup.updateMatrixWorld(true);
  let selected;
  viewer.onPartClick = id => { selected = id; };
  viewer._handlePointer({ clientX: 50, clientY: 50 }, 'click');
  assert.equal(selected, 'back');
});

test('Solo/restore preserves existing hidden choices and hidden parts are not pickable', () => {
  const viewer = fixture();
  viewer.soloPart('back');
  assert.equal(viewer.parts.get('front').object3D.visible, false);
  let selected;
  viewer.onPartClick = id => { selected = id; };
  viewer._handlePointer({ clientX: 50, clientY: 50 }, 'click');
  assert.equal(selected, 'back');
  viewer.restoreAllParts();
  assert.equal(viewer.parts.get('front').object3D.visible, true);
  assert.equal(viewer.parts.get('hidden').object3D.visible, false);
});

test('Opacity changes refresh the shader and clearing selection restores layer opacity', () => {
  const viewer = fixture(), material = viewer.parts.get('front').materials[0].material;
  const version = material.version;
  viewer.setLayerOpacity('bone', 0.16);
  assert.equal(material.transparent, true);
  assert.ok(material.version > version);
  assert.equal(material.depthWrite, false);
  viewer.isolate('back');
  assert.equal(material.opacity, 0.16, 'Already-transparent anatomical context remains legible');
  viewer.setLayerOpacity('bone', 0.6);
  assert.ok(material.opacity < 0.6);
  viewer.setLayerOpacity('bone', 0.16);
  viewer.clearIsolation();
  assert.equal(material.opacity, 0.16);
  viewer.setLayerOpacity('bone', 1);
  assert.equal(material.transparent, false);
  assert.equal(material.depthWrite, true);
});

test('Drag, right-drag and multi-touch gestures do not select; clicks still do', () => {
  const viewer = fixture(), picks = [];
  viewer._handlePointer = (event, kind) => picks.push(kind);
  viewer._initEvents();
  const event = (x, button = 0, id = 1) => ({ clientX: x, clientY: 50, pointerId: id, button, buttons: 1, pointerType: 'mouse' });
  for (const button of [0, 2]) {
    viewer.handlers.get('pointerdown')(event(10, button));
    viewer.handlers.get('pointermove')(event(40, button));
    viewer.handlers.get('pointerup')(event(40, button));
  }
  assert.deepEqual(picks, []);
  viewer.handlers.get('pointerdown')(event(10));
  viewer.handlers.get('pointerup')(event(10));
  viewer.handlers.get('pointerdown')(event(10, 2));
  viewer.handlers.get('pointerup')(event(10, 2));
  assert.deepEqual(picks, ['click', 'context']);
  viewer.handlers.get('pointerdown')(event(10));
  viewer.handlers.get('pointerdown')(event(10, 0, 2));
  viewer.handlers.get('pointerup')(event(10));
  assert.deepEqual(picks, ['click', 'context']);
});

test('Labels move with exploded bone, inherit visibility, and dispose geometry on clear', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, remove() {} }) };
  try {
    const viewer = fixture();
    viewer.showAnnotations('front', [{ label: 'Example', coordinateSpace: 'part-local', position: [0, 0, 1], offset: [1, 1, 1], evidence: { status: 'reviewed', mesh: 'front.glb', source: 'Synthetic fixture', description: 'Test only', reviewer: 'Test' } }]);
    const group = viewer.annotationGroup, part = viewer.parts.get('front');
    assert.equal(group.parent, part.object3D);
    const before = group.getWorldPosition(new THREE.Vector3());
    viewer.setExplodeAmount(1, false);
    assert.deepEqual(group.getWorldPosition(new THREE.Vector3()).sub(before).toArray(), [5, 1, 0]);
    viewer.setPartVisibility('front', false);
    assert.equal(group.parent.visible, false);
    let disposed = false;
    group.children[0].geometry.addEventListener('dispose', () => { disposed = true; });
    viewer.clearAnnotations();
    assert.equal(disposed, true);
    assert.equal(group.parent, null);
  } finally { globalThis.document = previous; }
});

test('Nerve meshes remain assembled while bones are separated', () => {
  const viewer = fixture(), nerve = viewer.parts.get('back');
  nerve.explode = false;
  viewer.setExplodeAmount(1, false);
  assert.deepEqual(nerve.object3D.position.toArray(), nerve.originalPosition.toArray());
  viewer.setExplodeAmount(0, false);
  assert.deepEqual(viewer.parts.get('front').object3D.position.toArray(), [0, 0, 2]);
});


test('Guessed, undocumented and wrong-mesh annotations are withheld', () => {
  const viewer = fixture();
  viewer.showAnnotations('front', [{ label: 'Old guess', anchor: [0, 0, 1] }]);
  assert.ok(!viewer.annotationGroup);
  const record = { label: 'Fixture', coordinateSpace: 'part-local', position: [1, 2, 3], evidence: { status: 'reviewed', mesh: 'front.glb', source: 'Fixture', description: 'Synthetic test', reviewer: 'Test' } };
  assert.equal(viewer.isSupportedAnnotation('front', record), true);
  assert.equal(viewer.isSupportedAnnotation('back', record), false);
  assert.equal(viewer.isSupportedAnnotation('front', { ...record, position: [NaN, 0, 0] }), false);
  assert.equal(viewer.isSupportedAnnotation('front', { ...record, evidence: {} }), false);
});

test('Picking respects hidden child meshes and fresh explode transforms', () => {
  const viewer = fixture();
  viewer.parts.get('front').materials[0].mesh.visible = false;
  let selected;
  viewer.onPartClick = id => { selected = id; };
  viewer._handlePointer({ clientX: 50, clientY: 50 }, 'click');
  assert.equal(selected, 'back');
  viewer.setExplodeAmount(1, false);
  viewer._handlePointer({ clientX: 50, clientY: 50 }, 'click');
  assert.equal(selected, null);
});


test('Salivary meshes retain source identity, vertex count and provenance', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../sources/salivary/manifest.json', import.meta.url)));
  assert.equal(Object.keys(manifest.parts).length, 8);
  for (const [id, entry] of Object.entries(manifest.parts)) {
    const source = await fs.readFile(new URL('../sources/salivary/' + entry.file, import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'), entry.sha256);
    const binary = await fs.readFile(new URL('../meshes/salivary/' + id + '.glb', import.meta.url));
    const size = binary.readUInt32LE(12), gltf = JSON.parse(binary.toString('utf8', 20, 20 + size));
    assert.equal(gltf.extras.sha256, entry.sha256);
    assert.equal(gltf.extras.sourceName, entry.sourceName);
    const count = entry.file.endsWith('.obj') ? source.toString().split(/\r?\n/).filter(line => line.startsWith('v ')).length : Number(source.toString('latin1').match(/POINTS (\d+) float/)[1]);
    assert.equal(gltf.accessors[0].count, count);
    if (id.startsWith('parotid')) assert.match(gltf.extras.registration.limitation, /Different atlas specimen/);
  }
});

test('Dental study pointers match stored vertices and exact mesh version', async () => {
  const content = JSON.parse(await fs.readFile(new URL('../data/skull_content.json', import.meta.url)));
  assert.equal(Object.values(content.annotations).flat().length, 24);
  for (const [bone, annotations] of Object.entries(content.annotations)) {
  if (!annotations.length) continue;
  const binary = await fs.readFile(new URL('../meshes/skull/' + bone + '.glb', import.meta.url));
  const n = binary.readUInt32LE(12), gltf = JSON.parse(binary.toString('utf8', 20, 20 + n));
  const a = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION], view = gltf.bufferViews[a.bufferView];
  for (const annotation of annotations) {
    assert.equal(annotation.evidence.status, 'visual-localization');
    assert.equal(annotation.evidence.meshSha256, createHash('sha256').update(binary).digest('hex'));
    const start = 28 + n + (view.byteOffset || 0) + (a.byteOffset || 0) + annotation.evidence.vertexIndex * (view.byteStride || 12);
    assert.deepEqual(annotation.position, [0, 1, 2].map(axis => binary.readFloatLE(start + axis * 4)));
    assert.ok(!('anchor' in annotation));
  }
  }
});

test('Structure labels handle child transforms; clearing a label set frees every group', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, remove() {} }) };
  try {
    const viewer = fixture(), mesh = viewer.parts.get('front').materials[0].mesh;
    mesh.position.set(12, 3, 1);
    mesh.scale.setScalar(2);
    const label = viewer.structureAnnotation('front', 'Front');
    assert.equal(label.evidence.status, 'structure-identity');
    assert.ok(label.position[0] >= 11 && label.position[0] <= 13);
    viewer.showAnnotationSet([['front', [label]], ['back', [viewer.structureAnnotation('back', 'Back')]]]);
    const groups = [...viewer.annotationGroups];
    assert.equal(groups.length, 2);
    let disposed = 0;
    groups.forEach(group => group.children[0].geometry.addEventListener('dispose', () => disposed++));
    viewer.setExplodeAmount(1, false);
    assert.equal(groups[0].parent, viewer.parts.get('front').object3D);
    viewer.clearAnnotations();
    assert.equal(disposed, 2);
    assert.ok(groups.every(group => !group.parent));
  } finally { globalThis.document = previous; }
});

test('Labels follow projected anchors at different zooms rather than viewport edges', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ style: {}, dataset: {}, offsetWidth:120, offsetHeight:24, setAttribute() {}, remove() {} }) };
  try {
    const viewer = fixture();
    viewer.container = {clientWidth:800,clientHeight:600};
    viewer.camera.aspect = 800/600; viewer.camera.updateProjectionMatrix();
    const record = { label:'Feature', coordinateSpace:'part-local', position:[1,0,0], evidence:{status:'reviewed',mesh:'front.glb',source:'Fixture',description:'Test',reviewer:'Test'} };
    viewer.showAnnotations('front',[record]);
    for (const distance of [10,40]) {
      viewer.camera.position.z = distance;
      viewer._layoutAnnotations();
      const item = viewer.annotationItems[0];
      const a = item.group.localToWorld(item.anchor.clone()).project(viewer.camera);
      const b = item.group.localToWorld(item.label.position.clone()).project(viewer.camera);
      assert.ok(Math.abs((b.x-a.x)*400 - 74) < .001);
      assert.ok(Math.abs(b.y-a.y) < .001);
    }
  } finally {globalThis.document=previous;}
});
