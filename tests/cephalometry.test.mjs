import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { Viewer } from '../js/viewer.js';
import { visibleCephalometricPoints, showCephalometricPoints } from '../js/cephalometry.js';

const catalog = JSON.parse(await fs.readFile(new URL('../data/cephalometry.json', import.meta.url)));

test('Cephalometry uses the exact source vertices and explicitly constructed Me/Pog midpoint', async () => {
  assert.deepEqual(catalog.landmarks.map(mark => mark.id), ['S','N','Or','Po','ANS','PNS','Go','Me','Pog','Gn','A','B']);
  for (const mark of catalog.landmarks) for (const point of mark.points) {
    assert.equal(point.position.length, 3);
    assert.ok(point.position.every(Number.isFinite));
    if (point.kind === 'constructed') continue;
    const binary = await fs.readFile(new URL('../' + point.evidence.mesh, import.meta.url));
    assert.equal(createHash('sha256').update(binary).digest('hex'), point.evidence.meshSha256);
    const n = binary.readUInt32LE(12), gltf = JSON.parse(binary.toString('utf8', 20, 20 + n));
    const a = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION], view = gltf.bufferViews[a.bufferView];
    assert.ok(point.evidence.vertexIndex < a.count);
    const start = 28 + n + (view.byteOffset || 0) + (a.byteOffset || 0) + point.evidence.vertexIndex * (view.byteStride || 12);
    assert.deepEqual(point.position, [0,1,2].map(axis => binary.readFloatLE(start + axis * 4)));
  }
  const p = id => catalog.landmarks.find(mark => mark.id === id).points[0];
  assert.equal(p('Gn').kind, 'constructed');
  assert.deepEqual(p('Gn').position, p('Me').position.map((v, i) => (v + p('Pog').position[i]) / 2));
  assert.deepEqual(p('PNS').parts, ['skull:palatine_bone_left','skull:palatine_bone_right']);
});

test('Full-skull cephalometry shows one side of paired marks and obeys individual visibility', () => {
  for (const side of ['left', 'right']) {
    const bones = new Set(catalog.landmarks.flatMap(mark => mark.points.flatMap(point => point.parts)));
    const parts = new Map([...bones].map(id => [id, { object3D: { visible: true } }]));
    const all = visibleCephalometricPoints(catalog, side, parts);
    assert.equal(all.length, 12);
    assert.equal(all.filter(point => point.side).length, 3);
    assert.ok(all.every(point => !point.side || point.side === side));
    const enabled = new Set(['S', 'Me']);
    assert.deepEqual(visibleCephalometricPoints(catalog, side, parts, enabled).map(p => p.code), ['S','Me']);
    assert.equal(visibleCephalometricPoints(catalog, side, parts, new Set()).length, 0);
    parts.get('skull:mandible').object3D.visible = false;
    assert.deepEqual(visibleCephalometricPoints(catalog, side, parts, enabled).map(p => p.code), ['S']);
  }
});

test('Sagittal clipping retains anatomical right after atlas transforms and restores full materials', () => {
  const viewer = Object.create(Viewer.prototype);
  viewer.contentGroup = new THREE.Group();
  viewer.contentGroup.rotation.x = -Math.PI/2;
  viewer.contentGroup.position.set(1, -1500, -140);
  const material = new THREE.MeshStandardMaterial();
  viewer.parts = new Map([['skull', { materials:[{material}] }]]);
  viewer.setSagittalCut(true);
  const world = point => viewer.contentGroup.localToWorld(new THREE.Vector3(...point));
  assert.ok(viewer.sagittalPlane.distanceToPoint(world([-30,-140,1500])) > 0);
  assert.ok(viewer.sagittalPlane.distanceToPoint(world([30,-140,1500])) < 0);
  assert.ok(Math.abs(viewer.sagittalPlane.distanceToPoint(world([-0.7,-140,1500]))) < 0.001);
  assert.equal(material.clippingPlanes.length, 1);
  assert.equal(material.side, THREE.DoubleSide);
  viewer.setSagittalCut(false);
  assert.equal(material.clippingPlanes.length, 0);
  assert.equal(material.side, THREE.FrontSide);
});

test('Removed half is not selectable by raycasting', () => {
  const viewer = Object.create(Viewer.prototype);
  viewer.contentGroup = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4,4,4), new THREE.MeshStandardMaterial());
  mesh.userData.partId = 'bone';
  viewer.contentGroup.add(mesh);
  viewer.parts = new Map([['bone',{ object3D:mesh, materials:[{mesh,material:mesh.material}], layerId:'skull' }]]);
  viewer.layerOpacity = new Map();
  viewer.pointer = new THREE.Vector2(); viewer.raycaster = new THREE.Raycaster();
  viewer.camera = new THREE.PerspectiveCamera(45,1,0.1,100);
  viewer.renderer = { domElement:{style:{},getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})} };
  let selected;
  viewer.onPartClick = id => {selected=id;};
  for (const enabled of [false,true]) for (const x of [-1,1]) {
    viewer.setSagittalCut(enabled);
    viewer.camera.position.set(x,0,10); viewer.camera.lookAt(x,0,0); viewer.camera.updateMatrixWorld();
    viewer._handlePointer({clientX:50,clientY:50}, 'click');
    assert.equal(selected, enabled && x > 0 ? null : 'bone');
  }
});

test('Twelve crowded marks float near their anchors without overlap after resize and zoom; cleanup frees dots and lines', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ style: {}, dataset: {}, offsetWidth:36, offsetHeight:28, setAttribute() {}, addEventListener() {}, remove() {} }) };
  try {
    const viewer = Object.create(Viewer.prototype);
    viewer.contentGroup = new THREE.Group();
    viewer.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    viewer.camera.position.z = 10;
    const points = Array.from({ length:12 }, (_, i) => ({ code:String(i), name:'Fixture', landmarkId:String(i), position:[0,-1 + i * 0.001,0] }));
    showCephalometricPoints(viewer, points, '0', () => {});
    for (const [width,height] of [[360,420],[526,506],[800,650]]) for (const z of [10,30]) {
      viewer.container = { clientWidth:width, clientHeight:height };
      viewer.camera.aspect = width/height;
      viewer.camera.position.z = z;
      viewer.camera.updateProjectionMatrix();
      viewer._layoutAnnotations();
      const centers = viewer.annotationItems.map(item => {
        const p = item.group.localToWorld(item.label.position.clone()).project(viewer.camera);
        return { x:(p.x + 1)*width/2, y:(1-p.y)*height/2 };
      }).sort((a,b) => a.y-b.y);
      centers.forEach((p,i) => {
        assert.ok(Math.abs(p.x - (width/2 + 42)) < 0.001);
        assert.ok(p.y >= 14 && p.y <= height-14);
        if (i) assert.ok(p.y-centers[i-1].y >= 28 + 5);
      });
    }
    let disposed = 0;
    viewer.annotationGroups[0].traverse(item => item.geometry?.addEventListener('dispose', () => disposed++));
    viewer.clearAnnotations();
    assert.equal(disposed, 24);
    assert.equal(viewer.annotationItems.length, 0);
    assert.equal(viewer.contentGroup.children.length, 0);
  } finally { globalThis.document = previous; }
});
