import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.ESS_API_TARGET || 'http://13.125.65.202:8080';
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('ESS_API_TARGET must be an HTTP(S) URL.');
  const proxy = {
    '/api': {
      target,
      changeOrigin: true,
      configure(proxyServer) {
        proxyServer.on('proxyReq', request => {
          request.removeHeader('origin');
        });
      },
    },
  };
  return {
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    preview: { host: '127.0.0.1', proxy },
  };
});

