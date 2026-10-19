// Bundles the CLI into a single dependency-free file: dist/cli.mjs.
import { build } from 'esbuild';
import { chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outfile = fileURLToPath(new URL('../../dist/cli.mjs', import.meta.url));

await build({
  entryPoints: [fileURLToPath(new URL('./src/index.ts', import.meta.url))],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __lbCreateRequire } from 'node:module';",
      'const require = __lbCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  logLevel: 'warning',
});
chmodSync(outfile, 0o755);
