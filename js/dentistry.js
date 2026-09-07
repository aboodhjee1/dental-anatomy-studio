// Whole source meshes are retained where they support dental anatomy.
const dentalBones = new Set([
  'mandible', 'maxilla_left', 'maxilla_right',
  'palatine_bone_left', 'palatine_bone_right',
  'temporal_bone_left', 'temporal_bone_right',
  'zygomatic_bone_left', 'zygomatic_bone_right', 'sphenoid_bone',
]);
export function isDentalStructure(id) {
  const [layer, key] = id.split(':');
  return layer === 'skull' ? dentalBones.has(key) : ['muscles', 'nerves', 'salivary'].includes(layer);
}
