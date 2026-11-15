import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Versi demo: tidak ada proxy ke backend; API dijawab oleh src/mock di peramban.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1500 }
});
