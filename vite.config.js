import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 5180/4010 rather than the usual 5173/3000: incident-visualizer holds
// 5174/4000 and the two are expected to run side by side.
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom' },
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/chat': 'http://localhost:4010',
    },
  },
});
