import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') return nextResolve(new URL('../vendor/three/build/three.module.js', import.meta.url).href, context);
    if (specifier.startsWith('three/addons/')) return nextResolve(new URL('../vendor/three/examples/jsm/' + specifier.slice(13), import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});
