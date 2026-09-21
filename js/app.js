import { isDentalStructure } from './dentistry.js';
import { visibleCephalometricPoints, showCephalometricPoints, cephalometryPanel, cephalometryDetail, cephalometryMenu } from './cephalometry.js';
import { StructureMenu } from './structure-menu.js';
import { Viewer } from './viewer.js?v=0.5.2';
import { openingDiagram, openingSummary } from './salivary.js';
import { loadLayerRegistry, loadLayerContent, meshUrl } from './loader.js?v=0.5.2';

const $ = id => document.getElementById(id);
const parts = new Map(), layers = new Map(), rows = new Map();
let structureMenu;
let cephalometry, cephalometryActive = false, cephSide = 'right', selectedCeph = 'S';
const enabledCeph = new Set();
let dentistryOnly = false;
const inScope = id => !dentistryOnly || isDentalStructure(id);
function setScope(dental) {
  dentistryOnly = dental;
  hiddenHistory.length = 0;
  document.querySelectorAll('[data-scope]').forEach(button => button.setAttribute('aria-pressed', (button.dataset.scope === 'dental') === dental));
  $('dentistry-scope-note').hidden = !dental;
  applyPreset(dental ? 'all' : 'bones');
  viewer.fit();
}

const hiddenHistory = [];
let viewer, selectedId = null, filter = 'all', activePreset = 'bones', ready = false;
const startupControls = [...document.querySelectorAll('button, input')].filter(element => element.id !== 'help-button' && !element.closest('dialog'));
startupControls.forEach(element => { element.disabled = true; });
const escape = value => { const span = document.createElement('span'); span.textContent = value ?? ''; return span.innerHTML; };
const safeLink = url => /^https:\/\//.test(url) ? escape(url) : '#';
const filteredParts = () => {
  const query = $('structure-search').value.toLowerCase().trim();
  return [...parts.entries()].filter(([id, part]) => inScope(id) && (filter === 'all' || part.layerId === filter) && part.searchText.includes(query));
};

function setFilter(id) {
  filter = id;
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', button.dataset.filter === id));
  const matches = new Set(filteredParts().map(([partId]) => partId));
  rows.forEach((row, partId) => { row.hidden = !matches.has(partId); });
  $('result-count').textContent = matches.size;
  $('no-results').hidden = matches.size > 0;
  $('show-filtered').disabled = matches.size === 0;
}

function sync() {
  for (const [id, row] of rows) {
    row.querySelector('input').checked = viewer.parts.get(id).visible;
    row.classList.toggle('selected', selectedId === id);
    row.querySelector('button').setAttribute('aria-pressed', selectedId === id);
  }
  for (const [id, layer] of layers) {
    const scopedIds = layer.ids.filter(inScope);
    const visible = scopedIds.filter(partId => viewer.parts.get(partId).visible).length;
    const checkbox = layer.card.querySelector('input[type=checkbox]');
    checkbox.checked = visible > 0;
    checkbox.indeterminate = visible > 0 && visible < scopedIds.length;
    checkbox.disabled = !scopedIds.length;
    layer.card.querySelector('small').textContent = scopedIds.length;
    layer.card.classList.toggle('is-on', visible > 0);
    const range = layer.card.querySelector('input[type=range]');
    range.value = Math.round((viewer.layerOpacity.get(id) ?? 1) * 100);
    layer.card.querySelector('output').textContent = `${range.value}%`;
  }
  const visibleNerves = [...viewer.parts.values()].some(part => part.object3D.visible && layers.get(part.layerId).studyType === 'nerve');
  const visibleSalivary = [...viewer.parts.values()].some(part => part.object3D.visible && part.layerId === 'salivary');
  $('salivary-note').hidden = !visibleSalivary;
  $('model-note').hidden = !visibleNerves;
  $('nerve-legend').hidden = !visibleNerves;
  $('explode-note').hidden = !((visibleNerves || visibleSalivary) && viewer.explodeAmount > 0);
  $('empty-scene').hidden = [...viewer.parts.values()].some(part => part.object3D.visible);
  $('selection-chip').hidden = !selectedId;
  $('restore-context').hidden = !viewer.soloId;
  $('undo-hide').hidden = !hiddenHistory.length;
  $('sagittal-view').setAttribute('aria-pressed', String(!!viewer.sagittalCut));
  $('sagittal-note').hidden = !viewer.sagittalCut;
  $('explode-slider').disabled = cephalometryActive || viewer.sagittalCut;
  if (selectedId) $('selection-name').textContent = parts.get(selectedId).displayName;
  document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', button.dataset.preset === activePreset));
  updateAnnotations();
}

function updateAnnotations() {
  $('labels-toggle').disabled = false;
  if (cephalometryActive) {
    const visible = visibleCephalometricPoints(cephalometry, cephSide, viewer.parts, enabledCeph);
    showCephalometricPoints(viewer, visible, selectedCeph, selectCephalometricMark);
    $('ceph-count').textContent = `${visible.length} / 12 shown`;
    document.querySelectorAll('[data-ceph-toggle]').forEach(input => { input.checked = enabledCeph.has(input.dataset.cephToggle); });
    updateCephalometricDetail(visible);
    return;
  }
  if (!$('labels-toggle').checked) { viewer.clearAnnotations(); $('labels-status').textContent = 'Names + available landmarks'; return; }
  const ids = selectedId ? [selectedId] : [...parts.keys()].filter(id => viewer.parts.get(id).object3D.visible &&
    (activePreset !== 'salivary' || parts.get(id).layerId === 'salivary'));
  const entries = [];
  let landmarks = 0;
  for (const id of ids.slice(0, 14)) {
    const part = parts.get(id);
    const supported = part.annotations.filter(annotation => viewer.isSupportedAnnotation(id, annotation) &&
      (id !== 'skull:mandible' || !annotation.label.startsWith('Right ')));
    if (selectedId && supported.length) { landmarks += supported.length; entries.push([id, supported]); }
    else {
      const offset = [id.endsWith('right') ? -20 : 20, 0, 15];
      const annotation = viewer.structureAnnotation(id, part.displayName, offset);
      if (annotation) entries.push([id, [annotation]]);
    }
  }
  viewer.showAnnotationSet(entries);
  $('labels-status').textContent = landmarks ? `${landmarks} study landmarks · visual placement` : ids.length > 14 ? `14 of ${ids.length} names · select to focus` : 'Structure names · select for landmarks';
}

function selectCephalometricMark(id) {
  if (!cephalometry.landmarks.some(mark => mark.id === id)) return;
  const labelFocus = document.activeElement?.classList.contains('ceph-label') ? document.activeElement.getAttribute('aria-label') : null;
  selectedCeph = id;
  updateAnnotations();
  if (labelFocus) [...document.querySelectorAll('.ceph-label')].find(element => element.getAttribute('aria-label') === labelFocus)?.focus({ preventScroll: true });
}

function updateCephalometricDetail(points) {
  const detail = $('ceph-detail');
  if (!detail) return;
  const mark = cephalometry.landmarks.find(mark => mark.id === selectedCeph);
  detail.innerHTML = cephalometryDetail(mark, points.some(point => point.landmarkId === selectedCeph));
  document.querySelectorAll('[data-ceph-id]').forEach(button => button.setAttribute('aria-pressed', button.dataset.cephId === selectedCeph));
}

function showDuctDiagram(family = 'parotid') {
  $('duct-diagram').innerHTML = openingDiagram(family);
  $('duct-summary').textContent = openingSummary(family);
  document.querySelectorAll('[data-duct]').forEach(button => button.setAttribute('aria-pressed', button.dataset.duct === family));
  if (!$('duct-dialog').open) $('duct-dialog').showModal();
}

function hideStructure(id) {
  if (!viewer.parts.get(id)?.visible) return;
  structureMenu.close();
  hiddenHistory.push(id);
  viewer.setPartVisibility(id, false);
  activePreset = null;
  if (selectedId === id || viewer.soloId === id) clearSelection();
  else { renderPanel(); sync(); }
  $('structure-action-status').textContent = `${parts.get(id).displayName} hidden. Use Undo hide to bring it back.`;
}

function restoreContext() {
  structureMenu.close();
  viewer.restoreAllParts();
  if (selectedId) renderPanel();
  sync();
}

function runStructureAction(action, id) {
  if (action === 'hide') hideStructure(id);
  if (action === 'solo') { selectPart(id, true); viewer.fit(id); }
  if (action === 'notes') selectPart(id, false, true);
}

function selectPart(id, solo = false, revealNotes = false) {
  structureMenu?.close();
  if (!id) { clearSelection(); return; }
  if (!parts.has(id) || !inScope(id)) return;
  if (cephalometryActive) applyPreset('bones');
  viewer.restoreAllParts();
  if (!viewer.parts.get(id).visible) activePreset = null;
  viewer.setPartVisibility(id, true);
  selectedId = id;
  if (solo) viewer.soloPart(id);
  viewer.isolate(id);
  updateAnnotations();
  renderPanel();
  sync();
  if (revealNotes && matchMedia('(max-width: 950px)').matches) {
    $('panel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    $('panel').focus({ preventScroll: true });
  }
}

function clearSelection() {
  structureMenu?.close();
  selectedId = null;
  viewer.restoreAllParts();
  viewer.clearIsolation();
  updateAnnotations();
  renderPanel();
  sync();
}

function renderPanel() {
  if (cephalometryActive) {
    $('panel-badge').className = 'badge';
    $('panel-badge').textContent = 'Cephalometry';
    $('panel-content').innerHTML = cephalometryPanel(cephalometry);
    updateCephalometricDetail(visibleCephalometricPoints(cephalometry, cephSide, viewer.parts, enabledCeph));
    return;
  }
  if (!selectedId) {
    $('panel-badge').className = 'badge';
    $('panel-badge').textContent = 'Start exploring';
    $('panel-content').innerHTML = `<div class="welcome"><div class="welcome-symbol" aria-hidden="true">↗</div><h2>Every structure.<br>A little more understood.</h2><p>Select a structure to discover its landmarks, nerve supply, and dental relevance.</p><ol class="welcome-steps"><li><b>01</b><span>Choose your layers.<br>Build the view you need.</span></li><li><b>02</b><span>Click the model or search<br>for a structure in the list.</span></li><li><b>03</b><span>Isolate, rotate, and connect<br>what you see to what you know.</span></li></ol><div class="study-tip"><span class="eyebrow">TRY THIS</span><p>Open <strong>Dental nerves</strong> and search for “inferior alveolar” to trace the pathway through the mandible.</p></div></div>`;
    return;
  }
  const part = parts.get(selectedId), layer = layers.get(part.layerId);
  const isNerve = layer.studyType === 'nerve';
  $('panel-badge').className = `badge ${isNerve ? 'nerve' : ''}`;
  $('panel-badge').textContent = isNerve ? `${part.division} · Atlas mesh` : layer.label;
  $('panel-content').innerHTML = `<h2 class="selected-title">${escape(part.displayName)}</h2>
    ${part.summary ? `<p class="structure-summary">${escape(part.summary)}</p>` : ''}
    <div class="panel-actions"><button id="solo-selection">${viewer.soloId ? 'Restore context' : 'Show only'}</button><button id="focus-selection">Zoom to structure</button><button id="hide-selection">Hide</button></div>
    ${isNerve ? `<p class="schematic-notice">BodyParts3D 4.3 · ${escape(part.sourceMesh.fileId)}<br>${escape(part.sourceMesh.sourceName)}<br>Source geometry aligned to this skull. Individual anatomy can vary.</p>` : ''}
    ${part.modelNote ? `<p class="schematic-notice">${escape(part.modelNote)}</p>` : ''}
    ${part.glandFamily ? `<section class="duct-card"><h3>Opening into the mouth</h3><p>${escape(openingSummary(part.glandFamily))}</p>${openingDiagram(part.glandFamily)}<button id="open-duct-detail" class="quiet-button">Enlarge duct diagram</button><small>Teaching diagram · not to scale</small></section>` : ''}
    ${part.layerId === 'skull' ? `<p class="muted landmark-status">${part.annotations.some(a => viewer.isSupportedAnnotation(selectedId, a)) ? 'Pointers identify selected surface features by visual inspection; they are not expert-validated measurements.' : 'The label names this whole bone. Its finer landmarks are described below; point placements are not available yet.'}</p>` : ''}
    <h3 class="section-label">${isNerve ? 'Pathway & dental relevance' : 'Anatomical landmarks'}</h3>
    ${(part.landmarks || []).map(item => `<article class="landmark"><h3>${escape(item.name)}</h3><p>${escape(item.description)}</p></article>`).join('') || '<p class="muted">No study notes available yet.</p>'}
    ${part.sources?.length ? `<h3 class="section-label">Read further</h3><ul class="reference-list">${part.sources.map(source => `<li><a href="${safeLink(source.url)}" target="_blank" rel="noopener">${escape(source.title)} ↗</a></li>`).join('')}</ul>` : ''}`;
  $('open-duct-detail')?.addEventListener('click', () => showDuctDiagram(part.glandFamily));
  $('solo-selection').addEventListener('click', () => {
    if (viewer.soloId) viewer.restoreAllParts();
    else viewer.soloPart(selectedId);
    $('solo-selection').textContent = viewer.soloId ? 'Restore context' : 'Show only';
    sync();
  });
  $('hide-selection').addEventListener('click', () => hideStructure(selectedId));
  $('focus-selection').addEventListener('click', () => { viewer.fit(selectedId); markCamera(null); });
}

function buildRow(id, part) {
  const row = document.createElement('div');
  row.className = 'part-row';
  row.dataset.partId = id;
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.setAttribute('aria-label', `Show ${part.displayName}`);
  checkbox.addEventListener('change', () => {
    viewer.restoreAllParts();
    viewer.setPartVisibility(id, checkbox.checked);
    activePreset = null;
    if (!checkbox.checked && selectedId === id) clearSelection();
    else { if (selectedId) renderPanel(); sync(); }
  });
  const button = document.createElement('button');
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = `${escape(part.displayName)}<small>${escape(part.division ? `${part.division} · ${part.group}` : layers.get(part.layerId).label)}</small>`;
  button.addEventListener('click', () => selectPart(id, false, true));
  row.append(checkbox, button);
  rows.set(id, row);
  return row;
}

function buildLayer(layer) {
  const card = document.createElement('div');
  card.className = 'layer-card';
  card.style.setProperty('--layer-color', layer.color);
  card.innerHTML = `<div class="layer-card-top"><span class="layer-dot" aria-hidden="true"></span><label>${escape(layer.label)} <small>${layer.ids.length}</small><input type="checkbox" aria-label="Show ${escape(layer.label)} layer"></label></div><div class="opacity-control"><span>Opacity</span><input type="range" min="5" max="100" value="100" aria-label="${escape(layer.label)} opacity"><output>100%</output></div>`;
  card.querySelector('input[type=checkbox]').addEventListener('change', event => {
    viewer.restoreAllParts();
    layer.ids.forEach(id => viewer.setPartVisibility(id, event.target.checked && inScope(id)));
    activePreset = null;
    if (selectedId && !viewer.parts.get(selectedId).visible) clearSelection();
    else { if (selectedId) renderPanel(); sync(); }
  });
  card.querySelector('input[type=range]').addEventListener('input', event => {
    viewer.setLayerOpacity(layer.id, Number(event.target.value) / 100);
    activePreset = null;
    sync();
  });
  card.querySelectorAll('input').forEach(input => { input.disabled = true; });
  layer.card = card;
  $('layer-controls').appendChild(card);
}

function markCamera(name) {
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', button.dataset.view === name));
  document.querySelector('.orientation i').textContent = ({ front: 'ANTERIOR VIEW', right: 'RIGHT LATERAL', left: 'LEFT LATERAL', base: 'INFERIOR VIEW' })[name] || 'FREE EXPLORATION';
  document.querySelectorAll('.orientation>span').forEach(span => { span.hidden = name !== 'front'; });
}

function applyPreset(name) {
  structureMenu?.close();
  hiddenHistory.length = 0;
  activePreset = name;
  viewer.setSagittalCut(false);
  cephalometryActive = name === 'cephalometry';
  document.body.classList.toggle('cephalometry-mode', cephalometryActive);
  document.querySelector('.interaction-hint').textContent = cephalometryActive
    ? 'Select a label · Drag to rotate · Scroll to zoom'
    : 'Hover for Hide / Show only · Drag to rotate · Scroll to zoom';
  $('ceph-menu').hidden = !cephalometryActive;
  $('ceph-controls').hidden = !cephalometryActive;
  $('explode-slider').disabled = cephalometryActive;
  $('explode-slider').title = cephalometryActive ? 'Cephalometric marks use the assembled skull.' : '';
  if (cephalometryActive) {
    dentistryOnly = false;
    document.querySelectorAll('[data-scope]').forEach(button => button.setAttribute('aria-pressed', button.dataset.scope === 'all'));
    $('dentistry-scope-note').hidden = true;
    $('labels-toggle').checked = true;
    cephSide = 'right';
    selectedCeph = 'S';
    enabledCeph.clear();
    cephalometry.landmarks.forEach(mark => enabledCeph.add(mark.id));
  }
  document.querySelectorAll('[data-ceph-side]').forEach(button => button.setAttribute('aria-pressed', button.dataset.cephSide === cephSide));
  if (name === 'salivary') $('labels-toggle').checked = true;
  selectedId = null;
  viewer.restoreAllParts();
  viewer.clearIsolation();
  viewer.clearAnnotations();
  for (const layer of layers.values()) {
    const settings = cephalometryActive ? { visible: layer.id === 'skull', opacity: layer.id === 'skull' ? 0.45 : 1 }
      : layer.presets?.[name] || { visible: layer.enabledByDefault, opacity: 1 };
    layer.ids.forEach(id => viewer.setPartVisibility(id, settings.visible && inScope(id)));
    viewer.setLayerOpacity(layer.id, settings.opacity);
  }
  viewer.setExplodeAmount(0, false);
  $('explode-slider').value = 0;
  $('explode-value').textContent = '0%';
  $('scene-title').textContent = ({ bones: 'Explore the skull', cephalometry: 'Cephalometric landmarks', nerves: 'Follow the dental nerves', all: 'See the connections', salivary: 'Salivary glands & openings' })[name];
  $('structure-search').value = '';
  setFilter(name === 'salivary' ? 'salivary' : name === 'nerves' ? 'nerves' : (name === 'bones' || cephalometryActive) ? 'skull' : 'all');
  viewer.setView(cephalometryActive ? 'right' : 'front');
  if (name === 'salivary') viewer.fit(new Set(layers.get('salivary').ids));
  markCamera(cephalometryActive ? 'right' : 'front');
  renderPanel();
  sync();
}

async function init() {
  const registry = await loadLayerRegistry();
  const cephResponse = await fetch('data/cephalometry.json');
  if (!cephResponse.ok) throw new Error('Cephalometric landmark data could not be loaded.');
  cephalometry = await cephResponse.json();
  $('ceph-menu').innerHTML = cephalometryMenu(cephalometry);
  viewer = new Viewer($('viewer-container'), {
    rotation: registry.scene?.rotation,
    onPartClick: id => { if (ready && !cephalometryActive) selectPart(id); },
    onPartContext: (id, event) => { if (ready && !cephalometryActive) structureMenu.show(id, event, { force: true }); },
    onPartHover: (id, event) => {
      if (!ready || cephalometryActive) return;
      rows.forEach((row, partId) => row.classList.toggle('hovered', partId === id));
      structureMenu.show(id, event);
    },
  });
  structureMenu = new StructureMenu($('structure-menu'), { nameFor: id => parts.get(id)?.displayName || '', onAction: runStructureAction });
  viewer.controls.addEventListener('start', () => { structureMenu.close(); markCamera(null); });
  const failures = [];
  let complete = 0;
  for (const definition of registry.layers) {
    const layer = { ...definition, ids: [] };
    layers.set(layer.id, layer);
    try {
      const content = await loadLayerContent(layer);
      await Promise.all(Object.entries(content.parts).map(async ([key, entry]) => {
        const id = `${layer.id}:${key}`;
        try {
          await viewer.loadPart(id, meshUrl(layer, entry), { color: entry.color, layerId: layer.id, visible: layer.enabledByDefault, explode: layer.explode !== false });
          const part = { ...entry, layerId: layer.id, annotations: content.annotations[key] || [] };
          part.searchText = [entry.displayName, entry.division, entry.group, entry.summary, ...(entry.landmarks || []).flatMap(item => [item.name, item.description])].join(' ').toLowerCase();
          parts.set(id, part);
          layer.ids.push(id);
        } catch (error) { failures.push(entry.displayName); console.error(error); }
        complete++;
        $('loading-indicator').textContent = `Loading your atlas · ${complete} structures processed`;
      }));
    } catch (error) { failures.push(layer.label); console.error(error); }
    buildLayer(layer);
  }
  if (!parts.size) throw new Error('No structures could be loaded. Check the local mesh folders.');
  for (const [id, part] of [...parts.entries()].sort((a, b) => a[1].displayName.localeCompare(b[1].displayName))) $('part-list').appendChild(buildRow(id, part));
  for (const [id, label] of [['all', 'All'], ...[...layers.values()].map(layer => [layer.id, layer.label])]) {
    const button = document.createElement('button');
    button.dataset.filter = id;
    button.textContent = label;
    button.addEventListener('click', () => setFilter(id));
    $('layer-filters').appendChild(button);
  }
  $('loading-indicator').hidden = !failures.length;
  if (failures.length) $('loading-indicator').textContent = `Some structures could not load: ${failures.join(', ')}. Reload to retry.`;
  viewer.frameAll();
  startupControls.forEach(element => { element.disabled = false; });
  document.querySelectorAll('.layer-card input').forEach(input => { input.disabled = false; });
  applyPreset('bones');
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => applyPreset(button.dataset.preset)));
  $('ceph-menu').addEventListener('click', event => {
    const button = event.target.closest('[data-ceph-id]');
    if (button && cephalometryActive) selectCephalometricMark(button.dataset.cephId);
    const bulk = event.target.closest('[data-ceph-visibility]');
    if (bulk) {
      enabledCeph.clear();
      if (bulk.dataset.cephVisibility === 'show') cephalometry.landmarks.forEach(mark => enabledCeph.add(mark.id));
      updateAnnotations();
    }
  });
  $('ceph-menu').addEventListener('change', event => {
    const id = event.target.dataset.cephToggle;
    if (!id) return;
    if (event.target.checked) enabledCeph.add(id); else enabledCeph.delete(id);
    updateAnnotations();
  });
  $('ceph-menu-button').addEventListener('click', () => {
    $('ceph-menu').scrollIntoView({ behavior: 'instant', block: 'start' });
    $('ceph-menu').querySelector('button').focus({ preventScroll: true });
  });
  document.querySelectorAll('[data-ceph-side]').forEach(button => button.addEventListener('click', () => {
    cephSide = button.dataset.cephSide;
    document.querySelectorAll('[data-ceph-side]').forEach(item => item.setAttribute('aria-pressed', item.dataset.cephSide === cephSide));
    if (cephSide === 'left') viewer.setSagittalCut(false);
    viewer.setView(cephSide); markCamera(cephSide); sync();
  }));
  $('sagittal-view').addEventListener('click', () => {
    viewer.setExplodeAmount(0, false);
    $('explode-slider').value = 0;
    $('explode-value').textContent = '0%';
    viewer.setSagittalCut(!viewer.sagittalCut);
    if (viewer.sagittalCut) {
      cephSide = 'right';
      document.querySelectorAll('[data-ceph-side]').forEach(button => button.setAttribute('aria-pressed', button.dataset.cephSide === 'right'));
      // Look from the removed (left) half toward the medial face of the right half.
      viewer.setView('left'); markCamera('left');
    } else { viewer.setView('right'); markCamera('right'); }
    sync();
  });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { viewer.setView(button.dataset.view); markCamera(button.dataset.view); }));
  document.querySelectorAll('[data-scope]').forEach(button => button.addEventListener('click', () => setScope(button.dataset.scope === 'dental')));
  $('reset-view').addEventListener('click', () => { $('labels-toggle').checked = false; applyPreset('bones'); });
  $('restore-scene').addEventListener('click', () => applyPreset('bones'));
  $('fit-view').addEventListener('click', () => viewer.fit());
  $('back-to-model').addEventListener('click', () => $('workspace').scrollIntoView({ behavior: 'instant', block: 'start' }));
  $('restore-context').addEventListener('click', restoreContext);
  $('undo-hide').addEventListener('click', () => {
    const id = hiddenHistory.pop();
    if (!id) return;
    viewer.restoreAllParts();
    viewer.setPartVisibility(id, true);
    activePreset = null;
    renderPanel(); sync();
    $('structure-action-status').textContent = `${parts.get(id).displayName} restored.`;
  });
  $('clear-selection').addEventListener('click', clearSelection);
  $('structure-search').addEventListener('input', () => setFilter(filter));
  $('show-filtered').addEventListener('click', () => {
    viewer.restoreAllParts();
    filteredParts().forEach(([id]) => viewer.setPartVisibility(id, true));
    activePreset = null;
    if (selectedId) renderPanel();
    sync();
  });
  $('explode-slider').addEventListener('input', event => {
    viewer.setExplodeAmount(Number(event.target.value) / 100);
    $('explode-value').textContent = `${event.target.value}%`;
    sync();
  });
  $('labels-toggle').addEventListener('change', updateAnnotations);
  document.addEventListener('keydown', event => {
    if ($('help-dialog').open || $('duct-dialog').open) return;
    if (event.key === 'Escape') clearSelection();
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !/INPUT|TEXTAREA/.test(event.target.tagName)) {
      event.preventDefault();
      if (cephalometryActive) $('ceph-menu-button').click(); else $('structure-search').focus();
    }
  });
  ready = true;
}

$('duct-openings-button').addEventListener('click', () => showDuctDiagram('parotid'));
document.querySelectorAll('[data-duct]').forEach(button => button.addEventListener('click', () => showDuctDiagram(button.dataset.duct)));
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
init().catch(error => {
  console.error(error);
  $('loading-indicator').hidden = false;
  $('loading-indicator').textContent = `Unable to start: ${error.message}. Run npm start in the app folder and use the localhost address. WebGL must be enabled.`;
});
