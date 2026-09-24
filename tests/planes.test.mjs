import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { Viewer } from '../js/viewer.js';
import { CEPH_PLANES, planeAnchors, transverseSheet, appendCephalometricPlanes } from '../js/cephalometric-planes.js';

const catalog = JSON.parse(await fs.readFile(new URL('../data/cephalometry.json', import.meta.url)));
const makeViewer = () => {
  const viewer = Object.create(Viewer.prototype);
  viewer.contentGroup = new THREE.Group();
  viewer.parts = new Map(catalog.landmarks.flatMap(m => m.points.flatMap(p => p.parts)).map(id => [id, { object3D: { visible: true } }]));
  return viewer;
};

test('Transverse sheets span both sides and contain the exact defining landmarks after atlas rotation', () => {
  for (const side of ['right', 'left']) for (const definition of CEPH_PLANES.slice(0, 4)) {
    const anchors = planeAnchors(catalog, definition, side);
    assert.ok(anchors.every(p => !p.side || p.side === side));
    const corners = transverseSheet(...anchors.map(p => p.position)).map(p => new THREE.Vector3(...p));
    assert.equal(corners[0].x, -95); assert.equal(corners[1].x, 28);
    const plane = new THREE.Plane().setFromCoplanarPoints(...corners.slice(0, 3));
    const transform = new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, -1500, -140);
    plane.applyMatrix4(transform);
    for (const p of anchors) assert.ok(Math.abs(plane.distanceToPoint(new THREE.Vector3(...p.position).applyMatrix4(transform))) < 1e-8);
    const length = Math.hypot(anchors[1].position[1] - anchors[0].position[1], anchors[1].position[2] - anchors[0].position[2]);
    assert.ok(Math.abs(corners[0].distanceTo(corners[3]) - length - 36) < 1e-8);
  }
});

test('FOP stays explicitly illustrative; height translates both endpoints and tilt rotates about their midpoint', () => {
  const definition = CEPH_PLANES.find(p => p.id === 'FOP');
  const base = planeAnchors(catalog, definition, 'right');
  const raised = planeAnchors(catalog, definition, 'right', { fopHeight: -9 });
  const tilted = planeAnchors(catalog, definition, 'right', { fopTilt: 10 });
  assert.ok(base.every(p => p.kind === 'illustrative' && p.parts.length === 0));
  base.forEach((p, i) => assert.equal(raised[i].position[2] - p.position[2], 5));
  const midZ = points => (points[0].position[2] + points[1].position[2]) / 2;
  assert.ok(Math.abs(midZ(base) - midZ(tilted)) < 1e-8);
  assert.notEqual(base[0].position[2], tilted[0].position[2]);
});

test('Plane toggles, supporting-bone visibility, asymmetric cut context and cleanup work together', () => {
  const viewer = makeViewer();
  const enabled = new Set(CEPH_PLANES.map(p => p.id));
  viewer.sagittalCut = true;
  assert.deepEqual(appendCephalometricPlanes(viewer, catalog, 'right', enabled, 'SN'), [...enabled]);
  const group = viewer.annotationGroups[0];
  assert.equal(group.children.filter(p => p.isMesh && p.geometry.index?.count === 6).length, 5);
  let geometries = 0, materials = 0;
  group.traverse(p => {
    p.geometry?.addEventListener('dispose', () => geometries++);
    p.material?.addEventListener('dispose', () => materials++);
    if (p.isMesh) { assert.equal(p.material.depthWrite, false); assert.ok(!p.material.clippingPlanes?.length); }
  });
  viewer.clearAnnotations();
  assert.equal(geometries, 25); assert.equal(materials, 25);
  assert.equal(viewer.contentGroup.children.length, 0);
  viewer.parts.get('skull:mandible').object3D.visible = false;
  assert.deepEqual(appendCephalometricPlanes(viewer, catalog, 'left', new Set(['MnPl', 'SN']), 'SN'), ['SN']);
  viewer.clearAnnotations();
  assert.deepEqual(appendCephalometricPlanes(viewer, catalog, 'left', new Set(), 'SN'), []);
});
