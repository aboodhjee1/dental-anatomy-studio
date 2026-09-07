// Public website files only. Never copy the workspace or environment files.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
await fs.mkdir(output, { recursive: true });
for (const name of ['index.html', 'css', 'js', 'data', 'meshes', 'vendor']) {
  await fs.cp(path.join(root, name), path.join(output, name), {
    recursive: true,
    filter: source => !path.basename(source).startsWith('.'),
  });
}
await fs.mkdir(path.join(output, 'licenses'), { recursive: true });
await fs.copyFile(path.join(root, 'sources/salivary/SPL-License.txt'), path.join(output, 'licenses/SPL-License.txt'));
await fs.copyFile(path.join(root, 'README.md'), path.join(output, 'licenses/README.md'));
await fs.writeFile(path.join(output, '.nojekyll'), '');
console.log('Static GitHub Pages site prepared in dist.');
