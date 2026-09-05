import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: ['noxcat.justinl.in'],
    port: 5173,
    strictPort: true
  },
  build: {
    target: 'es2022',
    sourcemap: true
  }
});
