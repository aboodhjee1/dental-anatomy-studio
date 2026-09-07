async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}
export async function loadLayerRegistry() {
  const registry = await fetchJson('data/layers.json');
  if (!Array.isArray(registry.layers)) throw new Error('The registry must contain a layers array.');
  return registry;
}
export function normalizeContent(json, layer) {
  const parts = json.parts ?? json[layer.partsKey];
  if (!parts || Array.isArray(parts) || typeof parts !== 'object') throw new Error(`No parts map in ${layer.contentFile}`);
  for (const [id, entry] of Object.entries(parts)) if (!entry.mesh || !entry.displayName) throw new Error(`Missing mesh or displayName for ${id}`);
  return { meta: json.meta || {}, parts, annotations: json.annotations || {} };
}
export async function loadLayerContent(layer) { return normalizeContent(await fetchJson(layer.contentFile), layer); }
export function meshUrl(layer, entry) { return `${layer.meshFolder}/${entry.mesh}`; }
