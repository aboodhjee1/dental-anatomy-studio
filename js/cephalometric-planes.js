import * as THREE from 'three';

// Definitions follow the user's orthodontic slide. X is left/right in atlas space.
export const CEPH_PLANES = [
  { id: 'SN', name: 'SN plane', through: ['S', 'N'], color: '#2878bd', description: 'Sella → Nasion. The cranial-base reference in your slide.' },
  { id: 'FH', name: 'Frankfort plane', through: ['Po', 'Or'], color: '#a76716', description: 'Porion → Orbitale. Uses the selected side’s landmarks.' },
  { id: 'MxPl', name: 'Maxillary plane', through: ['PNS', 'ANS'], color: '#138577', description: 'Posterior nasal spine → Anterior nasal spine.' },
  { id: 'MnPl', name: 'Mandibular plane', through: ['Go', 'Me'], color: '#ab4c83', description: 'Gonion → Menton. Uses Gonion on the selected side.' },
  { id: 'FOP', name: 'Functional occlusal plane', through: [], color: '#7760ba', description: 'Along the functional cusp tips of molars and premolars, as shown in your slide. This model has no recorded cusp landmarks, so this sheet is illustrative and adjustable.' },
];

export function planeAnchors(catalog, definition, side, { fopHeight = -14, fopTilt = 0 } = {}) {
  const point = id => catalog.landmarks.find(mark => mark.id === id)?.points.find(p => !p.side || p.side === side);
  if (definition.id !== 'FOP') return definition.through.map(id => point(id));
  // Explicit illustration only: offset from the palate, never claimed as cusp locations.
  const posterior = point('PNS'), anterior = point('ANS');
  if (!posterior || !anterior) return [];
  const a = [...posterior.position], b = [...anterior.position];
  const midY = (a[1] + b[1]) / 2, midZ = (a[2] + b[2]) / 2 + fopHeight;
  const slope = (b[2] - a[2]) / (b[1] - a[1]);
  const angle = Math.atan(slope) + THREE.MathUtils.degToRad(fopTilt);
  return [a, b].map((p, i) => ({ code: i ? 'Anterior guide' : 'Posterior guide', parts: [],
    position: [-0.7, p[1], midZ + (p[1] - midY) * Math.tan(angle)], kind: 'illustrative' }));
}

// Atlas +X is anatomical left; -X is anatomical right.
// Sheets bias wider toward the right so sagittal (right-half) view keeps useful sheet area.
export function transverseSheet(a, b, rightHalf = 95, leftHalf = 28, extension = 18) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start); direction.x = 0;
  if (direction.lengthSq() < 1e-8) throw new Error('Plane needs two distinct lateral positions.');
  direction.normalize();
  const rear = start.clone().addScaledVector(direction, -extension);
  const front = end.clone().addScaledVector(direction, extension);
  // Both original points lie on this sheet, even when their X coordinates differ.
  return [[-rightHalf, rear.y, rear.z], [leftHalf, rear.y, rear.z],
    [leftHalf, front.y, front.z], [-rightHalf, front.y, front.z]];
}

export function appendCephalometricPlanes(viewer, catalog, side, enabled, selected, options = {}) {
  const group = new THREE.Group(); group.name = 'cephalometric-planes';
  viewer.contentGroup.add(group);
  (viewer.annotationGroups ||= []).push(group);
  const shown = [];
  for (const definition of CEPH_PLANES) {
    if (!enabled.has(definition.id)) continue;
    const anchors = planeAnchors(catalog, definition, side, options);
    if (anchors.length !== 2 || anchors.some(p => !p || p.parts.some(id => !viewer.parts.get(id)?.object3D.visible))) continue;
    shown.push(definition.id);
    const corners = transverseSheet(...anchors.map(p => p.position));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
    const focused = definition.id === selected;
    const material = new THREE.MeshBasicMaterial({ color: definition.color, side: THREE.DoubleSide,
      transparent: true, opacity: (options.opacity ?? 0.22) * (focused ? 1 : 0.6), depthWrite: false });
    const sheet = new THREE.Mesh(geometry, material);
    sheet.name = definition.id; sheet.renderOrder = 2;
    group.add(sheet);
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners.map(p => new THREE.Vector3(...p))),
      new THREE.LineBasicMaterial({ color: definition.color, transparent: true, opacity: focused ? 0.95 : 0.6, depthWrite: false }));
    outline.renderOrder = 3; group.add(outline);
    const guideMaterial = definition.id === 'FOP'
      ? new THREE.LineDashedMaterial({ color: definition.color, dashSize: 3, gapSize: 2, depthTest: false, depthWrite: false })
      : new THREE.LineBasicMaterial({ color: definition.color, depthTest: false, depthWrite: false });
    const guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints(anchors.map(p => new THREE.Vector3(...p.position))), guideMaterial);
    guide.computeLineDistances(); guide.renderOrder = 6; group.add(guide);
    for (const anchor of anchors) {
      // Match landmark markers: red for recorded points; keep FOP guides in plane color.
      const dotColor = definition.id === 'FOP' ? definition.color : 0xd8463e;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(focused ? 1.5 : 1, 12, 8),
        new THREE.MeshBasicMaterial({ color: dotColor, depthTest: false, depthWrite: false }));
      dot.position.set(...anchor.position); dot.renderOrder = 8; group.add(dot);
    }
  }
  return shown;
}

export function planesMenu() {
  return `<section class="planes-section" aria-labelledby="planes-heading">
    <div class="section-heading"><h2 id="planes-heading">Transverse sheets</h2><span id="plane-count" role="status"></span></div>
    <p class="model-note">Across the skull, preserving each reference line’s slope. Select a plane to highlight its defining points.</p>
    <div class="ceph-bulk"><button type="button" data-plane-bulk="show">Show all planes</button><button type="button" data-plane-bulk="hide">Hide all planes</button></div>
    <div class="ceph-list plane-list">${CEPH_PLANES.map(p => `<div class="ceph-row" style="--plane-color:${p.color}"><input type="checkbox" data-plane-toggle="${p.id}" aria-label="Show ${p.name}"><button type="button" data-plane-id="${p.id}" aria-pressed="false"><b>${p.id}</b><span>${p.name}<small>${p.through.join(' → ') || 'Illustrative · adjustable'}</small></span></button></div>`).join('')}</div>
    <button type="button" class="quiet-button" id="plane-only">Show selected plane only</button>
    <label class="plane-slider" for="plane-opacity">Sheet opacity <output id="plane-opacity-value">22%</output><input id="plane-opacity" type="range" min="5" max="55" value="22"></label>
    <details class="fop-settings"><summary>Adjust illustrative FOP</summary><p class="model-note">Starting guide: 14 mm below the palate reference, parallel to it. These are illustration controls, not measured cusp positions.</p>
      <label class="plane-slider" for="fop-height">Height relative to palate <output id="fop-height-value">−14 mm</output><input id="fop-height" type="range" min="-30" max="0" value="-14"></label>
      <label class="plane-slider" for="fop-tilt">Tilt adjustment <output id="fop-tilt-value">0°</output><input id="fop-tilt" type="range" min="-20" max="20" value="0"></label>
      <button type="button" id="fop-reset" class="quiet-button">Reset FOP guide</button>
    </details>
  </section>`;
}

export function planeDetail(id, side, visible) {
  const p = CEPH_PLANES.find(p => p.id === id);
  return `<span class="eyebrow">${id === 'FOP' ? 'ILLUSTRATIVE PLANE' : 'LANDMARK PLANE'}</span><h3 style="color:${p.color}">${p.id} · ${p.name}</h3>
    <p>${p.description}</p>${p.through.length ? `<p class="plane-route">${p.through.join(' → ')} <small>· ${side} landmarks</small></p>` : ''}
    <p class="ceph-tip">The colored segment joins the defining points; the sheet extends beyond them, much farther to the anatomical right than the left so sagittal view retains a wide sheet into the visible half. Outer edges are display boundaries.</p>
    ${id === 'FOP' ? '<p class="schematic-notice">Dashed guide and dots show adjustable illustration endpoints, not identified tooth cusps. Use Adjust illustrative FOP in the plane menu.</p>' : '<p class="ceph-tip">This sheet extends the selected lateral reference across the skull; it is not a fitted plane through all bilateral landmarks.</p>'}
    ${visible ? '' : '<p class="ceph-hidden">This plane is hidden. Enable it in the plane menu.</p>'}`;
}
