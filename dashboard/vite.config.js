import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the dashboard talks to the API through this proxy, so the
// session cookie is same-origin. In production set VITE_API_URL instead.
const API = process.env.API_PROXY_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5190,
    strictPort: true,
    proxy: { '/api': API, '/uploads': API }
  }
});
