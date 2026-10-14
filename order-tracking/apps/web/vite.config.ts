import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // У розробці API (NestJS) працює окремо на :3000
    proxy: { '/api': 'http://localhost:3000', '/auth': 'http://localhost:3000' },
  },
});
