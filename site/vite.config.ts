import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const root = resolve(import.meta.dirname, '..');

// The Try it diagrams, the first one opening first (see demo/README.md).
const DEMO_DIAGRAMS = ['site/demo/todomvc-react.logic.json', 'logic/landing-page.logic.json'];

/** Build only: the viewer from dist/viewer at /demo/, in demo mode, with the diagrams. */
function demo(): Plugin {
  let outDir = '';
  return {
    name: 'agentic-fbd-demo',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const target = join(outDir, 'demo');
      cpSync(join(root, 'dist/viewer'), target, { recursive: true });
      const files = DEMO_DIAGRAMS.map((path) => {
        const file = basename(path);
        cpSync(join(root, path), join(target, file));
        const { subject } = JSON.parse(readFileSync(join(root, path), 'utf8')) as { subject: { title: string; mode?: string } };
        const layoutPath = join(root, path.replace(/\.logic\.json$/, '.layout.json'));
        const layout = existsSync(layoutPath) ? basename(layoutPath) : undefined;
        if (layout) cpSync(layoutPath, join(target, layout));
        return { file, title: subject.title, mode: subject.mode, layout };
      });
      writeFileSync(join(target, 'demo.json'), JSON.stringify({ files }, null, 2) + '\n');
      const page = join(target, 'index.html');
      const html = readFileSync(page, 'utf8')
        .replace('<title>agentic-fbd</title>', '<title>agentic-fbd · Try it</title>')
        .replace('</head>', '    <meta name="agentic-fbd-demo" content="demo.json" />\n  </head>');
      writeFileSync(page, html);
    },
  };
}

// Served from the root of afbd.gabocodes.com by GitHub Pages.
export default defineConfig({
  base: '/',
  plugins: [react(), demo()],
  build: { outDir: 'dist', emptyOutDir: true },
});
