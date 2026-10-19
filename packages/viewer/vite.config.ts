import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const example = fileURLToPath(new URL('../../skills/logic-builder/examples/other-free-text.logic.json', import.meta.url));
const apiModule = fileURLToPath(new URL('../cli/src/api.ts', import.meta.url));

// Dev only: serve /api/doc and /api/events for LB_FILE (default: the design example),
// using the same handler as `logic-builder open`.
function devDocApi(): Plugin {
  return {
    name: 'logic-builder-dev-api',
    apply: 'serve',
    async configureServer(server) {
      const { createDocApi } = (await server.ssrLoadModule(apiModule)) as typeof import('../cli/src/api.ts');
      const file = process.env.LB_FILE ?? example;
      const api = createDocApi(file);
      server.middlewares.use((req, res, next) => {
        if (!api.handle(req, res)) next();
      });
      server.httpServer?.on('close', () => api.close());
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), devDocApi()],
  server: { fs: { allow: ['../..'] } },
  build: {
    outDir: fileURLToPath(new URL('../../dist/viewer', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
