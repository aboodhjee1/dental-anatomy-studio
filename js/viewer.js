import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class Viewer {
  constructor(container, { onPartClick, onPartHover, onPartContext, rotation = [0, 0, 0] } = {}) {
    Object.assign(this, { container, onPartClick, onPartHover, onPartContext });
    this.parts = new Map();
    this.layerOpacity = new Map();
    this.isolatedId = null;
    this.soloId = null;
    this.explodeAmount = 0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.localClippingEnabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive anatomy model. Use the structure list for keyboard selection.');
    container.appendChild(this.renderer.domElement);
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'annotation-layer';
    container.appendChild(this.labels.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8f9eac, 2.2));
    for (const [position, intensity] of [[[200, 300, 400], 2.2], [[-200, 80, -200], 1.4]]) {
      const light = new THREE.DirectionalLight(0xffffff, intensity);
      light.position.set(...position);
      this.scene.add(light);
    }
    this.contentGroup = new THREE.Group();
    this.contentGroup.rotation.set(...rotation.map(THREE.MathUtils.degToRad));
    this.scene.add(this.contentGroup);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 4000;
    this.loader = new GLTFLoader();
    this.stlLoader = new STLLoader();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._initEvents();
    this.resizeObserver = new ResizeObserver(() => this._onResize());
    this.resizeObserver.observe(container);
    this._onResize();
    this._animate();
  }

  _onResize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
  }

  _initEvents() {
    const dom = this.renderer.domElement;
    let gesture = null;
    dom.addEventListener('pointerdown', e => {
      if (gesture) gesture.dragged = true;
      else gesture = { x: e.clientX, y: e.clientY, id: e.pointerId, button: e.button, dragged: false };
    });
    dom.addEventListener('pointermove', e => {
      if (gesture && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 5) gesture.dragged = true;
      if (!e.buttons && e.pointerType !== 'touch') this._handlePointer(e, 'hover');
    });
    dom.addEventListener('pointerup', e => {
      if (!gesture || gesture.id !== e.pointerId) return;
      const clicked = !gesture.dragged && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) <= 5;
      const button = gesture.button;
      gesture = null;
      if (clicked && (button === 0 || button === 2)) this._handlePointer(e, button === 2 ? 'context' : 'click');
    });
    dom.addEventListener('pointercancel', () => { gesture = null; });
    dom.addEventListener('pointerleave', () => { dom.style.cursor = 'grab'; this.onPartHover?.(null); });
    dom.addEventListener('contextmenu', e => e.preventDefault());
  }

  _handlePointer(event, kind) {
    const dom = this.renderer.domElement, rect = dom.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // Invisible ancestors are not excluded by Raycaster. Never include annotations.
    this.contentGroup.updateWorldMatrix(true, true);
    const meshes = [];
    for (const part of this.parts.values()) for (const { mesh } of part.materials) {
      let visible = true;
      for (let node = mesh; node; node = node.parent) if (!node.visible) { visible = false; break; }
      if (visible) meshes.push(mesh);
    }
    const hits = this.raycaster.intersectObjects(meshes, false).filter(hit =>
      !this.sagittalCut || this.sagittalPlane.distanceToPoint(hit.point) >= 0);
    const hit = hits.find(item => (this.layerOpacity.get(this.parts.get(item.object.userData.partId).layerId) ?? 1) >= 0.35) || hits[0];
    const id = hit?.object.userData.partId || null;
    dom.style.cursor = id ? 'pointer' : 'grab';
    if (kind === 'hover') this.onPartHover?.(id, event);
    if (kind === 'click') this.onPartClick?.(id);
    if (kind === 'context' && id) this.onPartContext?.(id, event);
  }

  async loadPart(id, url, { color, layerId, visible = true, explode = true } = {}) {
    let object3D;
    if (url.toLowerCase().endsWith('.stl')) {
      object3D = new THREE.Group();
      object3D.add(new THREE.Mesh(await this.stlLoader.loadAsync(url)));
    } else object3D = (await this.loader.loadAsync(url)).scene;
    const materials = [];
    object3D.traverse(child => {
      if (!child.isMesh) return;
      child.userData.partId = id;
      if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
      (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => m.dispose());
      const material = new THREE.MeshStandardMaterial({ color: color ?? this._studyColor(id), roughness: 0.58 });
      child.material = material;
      materials.push({ mesh: child, material });
    });
    if (!materials.length) throw new Error(`No mesh geometry in ${url}`);
    this.contentGroup.add(object3D);
    this.parts.set(id, { object3D, materials, visible, layerId, explode, sourceUrl: url, originalPosition: object3D.position.clone() });
    object3D.visible = visible;
    this._updateMaterials();
  }

  _studyColor(id) {
    const palette = [0xcda487, 0xa6b9bf, 0xb3c4a2, 0xdac398, 0xbcacc5, 0x9cc5bf, 0xcda8ac];
    let hash = 0;
    for (const char of id.replace(/_(left|right)$/, '')) hash = ((hash << 5) - hash) + char.charCodeAt(0);
    return palette[Math.abs(hash) % palette.length];
  }

  frameAll() {
    this.contentGroup.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3();
    for (const part of this.parts.values()) for (const { mesh } of part.materials) bounds.expandByObject(mesh);
    if (bounds.isEmpty()) return;
    this.contentGroup.position.sub(bounds.getCenter(new THREE.Vector3()));
    this.contentGroup.updateWorldMatrix(true, true);
    this.modelSize = bounds.getSize(new THREE.Vector3()).length();
    const centerLocal = this.contentGroup.worldToLocal(new THREE.Vector3());
    for (const [id, part] of this.parts) {
      const center = new THREE.Box3().setFromObject(part.object3D).getCenter(new THREE.Vector3());
      const direction = this.contentGroup.worldToLocal(center).sub(centerLocal);
      if (direction.lengthSq() < 0.001) direction.set(id.endsWith('left') ? 1 : -1, 0, 0.4);
      part.explodeOffset = direction.normalize().multiplyScalar(this.modelSize * 0.34);
    }
    this.setView('front');
  }

  _visibleBounds(id = null) {
    this.contentGroup.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3();
    for (const [partId, part] of this.parts) {
      if (!part.object3D.visible || (id && (id instanceof Set ? !id.has(partId) : partId !== id))) continue;
      for (const { mesh } of part.materials) bounds.expandByObject(mesh);
    }
    return bounds;
  }

  fit(id = null, direction = null) {
    const bounds = this._visibleBounds(id);
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    const distance = Math.max(20, bounds.getSize(new THREE.Vector3()).length() / 2 / Math.sin(Math.min(vertical, horizontal)) * 1.06);
    const heading = direction || this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(heading, distance);
    this.camera.far = Math.max(5000, distance * 10);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setView(view) {
    const directions = { front: [0, 0, 1], right: [-1, 0, 0], left: [1, 0, 0], base: [0, -1, 0.001] };
    this.camera.up.set(0, 1, 0);
    this.fit(null, new THREE.Vector3(...(directions[view] || directions.front)).normalize());
  }

  setExplodeAmount(value, reframe = true) {
    this.explodeAmount = THREE.MathUtils.clamp(value, 0, 1);
    for (const part of this.parts.values()) {
      if (!part.explodeOffset) continue;
      part.object3D.position.copy(part.originalPosition);
      if (part.explode) part.object3D.position.addScaledVector(part.explodeOffset, this.explodeAmount);
    }
    if (reframe) this.fit();
  }

  setSagittalCut(enabled) {
    this.sagittalCut = enabled;
    // Atlas +X is anatomical left. Keep x <= -0.7 mm, the approximate
    // midsagittal plane of this atlas, transformed with the skull assembly.
    this.contentGroup.updateWorldMatrix(true, true);
    this.sagittalPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), -0.7)
      .applyMatrix4(this.contentGroup.matrixWorld);
    for (const part of this.parts.values()) for (const { material } of part.materials) {
      material.clippingPlanes = enabled ? [this.sagittalPlane] : [];
      material.clipShadows = enabled;
      material.side = enabled ? THREE.DoubleSide : THREE.FrontSide;
      material.needsUpdate = true;
    }
  }

  setPartVisibility(id, visible) {
    const part = this.parts.get(id);
    if (!part) return;
    part.visible = visible;
    part.object3D.visible = visible && (!this.soloId || this.soloId === id);
  }
  soloPart(id) {
    this.soloId = id;
    for (const [partId, part] of this.parts) part.object3D.visible = part.visible && partId === id;
  }
  restoreAllParts() {
    this.soloId = null;
    for (const part of this.parts.values()) part.object3D.visible = part.visible;
  }
  setLayerOpacity(id, opacity) { this.layerOpacity.set(id, THREE.MathUtils.clamp(opacity, 0.05, 1)); this._updateMaterials(); }
  _updateMaterials() {
    for (const [id, part] of this.parts) {
      const base = this.layerOpacity.get(part.layerId) ?? 1;
      const opacity = this.isolatedId && this.isolatedId !== id && base > 0.25 ? base * 0.28 : base;
      for (const { mesh, material } of part.materials) {
        material.opacity = opacity;
        const transparent = opacity < 1;
        if (material.transparent !== transparent) {
          material.transparent = transparent;
          // Three's opaque shader forces alpha=1; switching transparency needs
          // a new program as well as an updated opacity uniform.
          material.needsUpdate = true;
        }
        material.depthWrite = opacity >= 0.95;
        material.emissive.setHex(id === this.isolatedId ? 0x6b4c0d : 0x000000);
        material.emissiveIntensity = 0.22;
        mesh.renderOrder = opacity < 0.95 ? 1 : 0;
      }
    }
  }
  isolate(id) { this.isolatedId = id; this._updateMaterials(); }
  clearIsolation() { this.isolate(null); }

  clearAnnotations() {
    for (const group of this.annotationGroups || (this.annotationGroup ? [this.annotationGroup] : [])) {
      group.traverse(item => { item.geometry?.dispose(); item.material?.dispose(); item.element?.remove(); });
      group.removeFromParent();
    }
    this.annotationGroups = [];
    this.annotationItems = [];
    this.annotationGroup = null;
  }
  showAnnotationSet(entries) {
    this.clearAnnotations();
    for (const [id, annotations] of entries) this.showAnnotations(id, annotations, true);
  }
  structureAnnotation(id, name, offset = [18, 0, 16]) {
    const part = this.parts.get(id);
    if (!part) return null;
    part.object3D.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3();
    for (const { mesh } of part.materials) bounds.expandByObject(mesh);
    const center = bounds.getCenter(new THREE.Vector3());
    let nearest = new THREE.Vector3(), distance = Infinity;
    for (const { mesh } of part.materials) {
      const position = mesh.geometry.attributes.position, point = new THREE.Vector3();
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        const d = point.distanceToSquared(center);
        if (d < distance) { distance = d; nearest.copy(point); }
      }
    }
    return { label: name, coordinateSpace: 'part-local', position: part.object3D.worldToLocal(nearest).toArray(), offset,
      evidence: { status: 'structure-identity', mesh: part.sourceUrl, source: part.sourceUrl,
        description: 'Names the entire source mesh. This pointer is not a specific anatomical landmark.', reviewer: 'Source mesh identity' } };
  }
  showAnnotations(id, annotations = [], append = false) {
    if (!append) this.clearAnnotations();
    const part = this.parts.get(id);
    if (!part || !annotations.length) return;
    const group = new THREE.Group();
    for (const annotation of annotations) {
      if (!this.isSupportedAnnotation(id, annotation)) continue;
      // Coordinates are explicitly in the owning part's local frame, before
      // assembly rotation/translation and explode. Never infer anatomy from bounds.
      const anchor = new THREE.Vector3(...annotation.position);
      const end = anchor.clone().add(new THREE.Vector3(...(annotation.offset || [25, 20, 20])));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([anchor, end]), new THREE.LineBasicMaterial({ color: 0x52696b, depthTest: false, transparent: true, opacity: 0.8 }));
      line.renderOrder = 5;
      group.add(line);
      const element = document.createElement('div');
      element.className = 'anatomy-label';
      element.dataset.kind = annotation.evidence.status;
      element.textContent = annotation.evidence.status === 'structure-identity'
        ? annotation.label : annotation.label.replace(/^(Left|Right)\s+/i, '');
      element.title = annotation.evidence.description;
      const label = new CSS2DObject(element);
      label.position.copy(end);
      group.add(label);
      (this.annotationItems ||= []).push({ anchor, group, line, label, element });
    }
    if (!group.children.length) return 0;
    // Sharing the bone's transform also shares its visibility and exploded offset.
    part.object3D.add(group);
    (this.annotationGroups ||= []).push(group);
    this.annotationGroup = group;
    return group.children.length / 2;
  }
  isSupportedAnnotation(id, annotation) {
    const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
    const evidence = annotation?.evidence;
    return !!(this.parts.has(id) && annotation?.label &&
      annotation.coordinateSpace === 'part-local' && vector(annotation.position) &&
      (!annotation.offset || vector(annotation.offset)) &&
      ['reviewed', 'visual-localization', 'structure-identity'].includes(evidence?.status) && evidence.mesh === this.parts.get(id).sourceUrl &&
      typeof evidence.source === 'string' && evidence.source.trim() &&
      typeof evidence.description === 'string' && evidence.description.trim() &&
      typeof evidence.reviewer === 'string' && evidence.reviewer.trim());
  }
  _layoutAnnotations() {
    if (!this.annotationItems?.length) return;
    this.contentGroup.updateWorldMatrix(true, true);
    this.camera.updateMatrixWorld();
    const width = this.container.clientWidth, height = this.container.clientHeight;
    const columns = [[], []];
    for (const item of this.annotationItems) {
      let visible = true;
      for (let node = item.group; node; node = node.parent) if (!node.visible) visible = false;
      if (!visible) continue;
      const worldAnchor = item.group.localToWorld(item.anchor.clone());
      const onRetainedSide = !this.sagittalCut || this.sagittalPlane.distanceToPoint(worldAnchor) >= -2;
      const projected = worldAnchor.project(this.camera);
      const onScreen = onRetainedSide && projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1;
      item.label.visible = item.line.visible = onScreen;
      if (!onScreen) continue;
      columns[item.column === 'right' ? 1 : projected.x < 0 ? 0 : 1].push({ ...item, projected, y: (1 - projected.y) * height / 2 });
    }
    for (let side = 0; side < 2; side++) {
      const items = columns[side].sort((a, b) => a.y - b.y);
      let bottom = -Infinity;
      for (const item of items) {
        const labelHeight = item.element.offsetHeight || 24;
        item.anchorY = item.y;
        item.y = Math.max(item.y, bottom + labelHeight / 2);
        item.labelHeight = labelHeight;
        bottom = item.y + labelHeight / 2 + 6;
      }
      // Center collision spacing around the anchors instead of pinning labels
      // to viewport edges. The label-to-anchor gap stays small at every zoom.
      const shift = items.length ? items.reduce((sum, item) => sum + item.y - item.anchorY, 0) / items.length : 0;
      for (const [index, item] of items.entries()) {
        const labelWidth = item.element.offsetWidth || 130;
        const anchorX = (item.projected.x + 1) * width / 2;
        const preferredX = anchorX + (side === 0 ? -1 : 1) * (labelWidth / 2 + 14);
        const x = item.column === 'right' ? width - 36 : THREE.MathUtils.clamp(preferredX, labelWidth / 2 + 8, width - labelWidth / 2 - 8);
        const y = item.column === 'right'
          ? (items.length === 1 ? height / 2 : 24 + index * (height - 48) / (items.length - 1))
          : THREE.MathUtils.clamp(item.y - shift, 8 + item.labelHeight / 2, height - 8 - item.labelHeight / 2);
        const end = new THREE.Vector3(x / width * 2 - 1, 1 - y / height * 2, item.projected.z).unproject(this.camera);
        item.group.worldToLocal(end);
        item.label.position.copy(end);
        const edgeX = THREE.MathUtils.clamp(anchorX, x - labelWidth / 2, x + labelWidth / 2);
        const edgeY = THREE.MathUtils.clamp(item.anchorY, y - item.labelHeight / 2, y + item.labelHeight / 2);
        const edge = item.group.worldToLocal(new THREE.Vector3(edgeX / width * 2 - 1, 1 - edgeY / height * 2, item.projected.z).unproject(this.camera));
        item.line.geometry.attributes.position.setXYZ(1, edge.x, edge.y, edge.z);
        item.line.geometry.attributes.position.needsUpdate = true;
        item.line.geometry.computeBoundingSphere();
      }
    }
  }
  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this._layoutAnnotations();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
