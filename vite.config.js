import { defineConfig } from 'vite';

// In development the game runs on Vite and the score endpoints are proxied
// to the Express backend (npm start, port 8080).
const backend = 'http://localhost:' + (process.env.BACKEND_PORT || 8080);

export default defineConfig({
  server: {
    proxy: {
      '/gamestates': backend,
      '/auth': backend,
      '/api': backend,
      '/health': backend
    }
  },
  build: {
    chunkSizeWarningLimit: 1200
  }
});
