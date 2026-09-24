import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Midline points are retained for either side; paired points use the subject's side.
export function visibleCephalometricPoints(catalog, side, parts, enabled = new Set(catalog.landmarks.map(mark => mark.id))) {
  return catalog.landmarks.flatMap(landmark => landmark.points
    .filter(point => enabled.has(landmark.id) && (!point.side || point.side === side) &&
      point.parts.every(id => parts.get(id)?.object3D.visible))
    .map(point => ({ ...point, landmarkId: landmark.id, name: landmark.name })));
}

export function showCephalometricPoints(viewer, points, selectedId, onSelect, { nearAnchors = true } = {}) {
  viewer.clearAnnotations();
  const group = new THREE.Group();
  viewer.contentGroup.add(group);
  viewer.annotationGroups = [group];
  viewer.annotationItems = [];
  for (const point of points) {
    const selected = point.landmarkId === selectedId;
    const color = point.color || (selected ? 0xb25523 : 0x156d67);
    // Red dots distinguish measured/constructed anatomical points from the
    // colored reference sheets. FOP's endpoints remain purple because they
    // are explicitly illustrative rather than recorded cusp landmarks.
    const dotColor = point.kind === 'illustrative' ? color : 0xd8463e;
    const anchor = new THREE.Vector3(...point.position);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(selected ? 1.8 : 1.35, 12, 8),
      new THREE.MeshBasicMaterial({ color: dotColor, depthTest: false, depthWrite: false }));
    dot.position.copy(anchor);
    dot.renderOrder = 8;
    group.add(dot);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([anchor, anchor]),
      new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.8 }));
    line.renderOrder = 7;
    group.add(line);
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'anatomy-label ceph-label';
    if (point.color) {
      element.style.borderColor = point.color;
      element.style.color = selected ? '#ffffff' : point.color;
      if (selected) element.style.background = point.color;
    }
    element.textContent = point.code;
    element.setAttribute('aria-label', `${point.code}: ${point.name}${point.side ? ` (${point.side})` : ''}`);
    element.setAttribute('aria-pressed', String(selected));
    element.title = `${point.name} · approximate study placement`;
    element.addEventListener('pointerdown', event => event.stopPropagation());
    element.addEventListener('click', event => { event.stopPropagation(); onSelect(point.landmarkId); });
    const label = new CSS2DObject(element);
    label.position.copy(anchor);
    group.add(label);
    viewer.annotationItems.push({ anchor, group, line, label, element, column: nearAnchors ? 'near' : 'right' });
  }
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function cephalometryPanel(catalog) {
  return `<h2 class="selected-title">Marks &amp; planes</h2>
    <p class="structure-summary">Select a plane or landmark in the menu to study where it passes. Colored sheets extend across the skull; their defining points remain visible through bone.</p>
    <section id="ceph-detail" class="ceph-detail" aria-live="polite"></section>
    <p class="schematic-notice">Approximate placements on this atlas, not expert-validated cephalometric measurements. Markers remain visible through bone. S and Gn are constructed points.</p>
    <details class="ceph-references"><summary>Definitions &amp; placement notes</summary>
      <p class="muted">L/R refer to the subject. Paired points are separate 3D locations; their shadows may overlap in a lateral radiograph. This rotatable perspective atlas is not a calibrated cephalogram.</p>
      <ul class="reference-list">${catalog.sources.map(source => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener">${escape(source.title)}</a></li>`).join('')}</ul>
    </details>`;
}

export function cephalometryMenu(catalog) {
  return `<div class="section-heading"><h2 id="ceph-menu-title">Cephalometric landmarks</h2><span id="ceph-count" role="status"></span></div>
    <p class="model-note">Show or hide each mark. Use Sagittal view to see the right half of the skull.</p>
    <div class="ceph-bulk"><button type="button" data-ceph-visibility="show">Show all marks</button><button type="button" data-ceph-visibility="hide">Hide all marks</button></div>
    <div class="ceph-list" aria-label="Cephalometric landmarks">${catalog.landmarks.map(mark =>
      `<div class="ceph-row"><input type="checkbox" data-ceph-toggle="${escape(mark.id)}" aria-label="Show ${escape(mark.id)} — ${escape(mark.name)}" checked><button type="button" data-ceph-id="${escape(mark.id)}" aria-pressed="false"><b>${escape(mark.id)}</b><span>${escape(mark.name)}</span></button></div>`).join('')}</div>`;
}

export function cephalometryDetail(mark, available) {
  return `<span class="eyebrow">${mark.points.some(p => p.kind === 'constructed') ? 'CONSTRUCTED POINT' : mark.points.length > 1 ? 'PAIRED LANDMARK' : 'MIDLINE LANDMARK'}</span>
    <h3>${escape(mark.id)} · ${escape(mark.name)}</h3><p>${escape(mark.definition)}</p>
    <p class="ceph-tip">${escape(mark.note)}</p>${available ? '' : '<p class="ceph-hidden">This mark is hidden. Enable it in the landmark menu to show it.</p>'}`;
}
