import { defineConfig, createLogger } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { readFileSync } from 'node:fs'

const customLogger = createLogger()
const loggerError = customLogger.error.bind(customLogger)
customLogger.error = (msg, options) => {
  if (
    typeof msg === 'string' &&
    msg.includes('ws proxy socket error') &&
    ((options?.error as { code?: string })?.code === 'ECONNRESET' || msg.includes('ECONNRESET'))
  ) {
    return
  }
  loggerError(msg, options)
}

// Vite config — https://vitejs.dev/config/
export default defineConfig({
  customLogger,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'preview-production-routes',
      configurePreviewServer(server) {
        // Preview the same per-page HTML and private SPA fallback used on Vercel.
        const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
        const rules = config.rewrites.map((rule: { source: string; destination: string }) => ({ pattern: new RegExp(`^${rule.source}$`), destination: rule.destination }));
        server.middlewares.use((request, _response, next) => {
          const pathname = new URL(request.url || '/', 'http://localhost').pathname;
          if (pathname.startsWith('/api') || pathname.startsWith('/health')) return next();
          const rule = rules.find((item: { pattern: RegExp }) => item.pattern.test(pathname));
          if (rule) request.url = rule.destination;
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 8443,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/socket.io': {
        target: 'http://127.0.0.1:5000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/socket.io': {
        target: 'http://127.0.0.1:5000',
        ws: true,
        changeOrigin: true,
      },
    },
    host: '0.0.0.0',
    port: 8443,
  },
})
