import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => {
  // Ідентифікатор збірки: вшивається в бандл і пишеться в dist/version.json — сервер віддає його
  // в X-App-Build, і відкриті вкладки зі старою збіркою перезавантажуються (src/version.ts).
  const buildId = command === 'build' ? (process.env.BUILD_ID || Date.now().toString(36)) : 'dev';
  return {
    plugins: [
      react(),
      {
        name: 'build-id',
        apply: 'build',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId }) });
        },
      },
    ],
    define: { __BUILD_ID__: JSON.stringify(buildId) },
    server: {
      port: 5173,
      // У розробці API (NestJS) працює окремо на :3000
      proxy: { '/api': 'http://localhost:3000', '/auth': 'http://localhost:3000' },
    },
  };
});
