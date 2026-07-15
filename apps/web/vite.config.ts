import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Code-split dos vendors pesados para manter o carregamento inicial leve.
        // Nota: o @supabase/supabase-js NÃO é agrupado de propósito — quando o
        // build roda sem env, `env.configured` vira `false` em tempo de build e
        // toda a lib é eliminada (tree-shaking). Com env presente, ela entra no
        // chunk que a importa. Forçar um chunk nomeado geraria um chunk vazio.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('i18next')) return 'i18n';
          if (
            id.includes('/react-router') ||
            id.includes('/react-dom/') ||
            id.includes('/react/') ||
            id.includes('/scheduler/')
          ) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
