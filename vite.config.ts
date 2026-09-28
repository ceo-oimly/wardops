import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, Plugin } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware to route root '/' requests to '/coverage.html'
function rootRedirectPlugin(): Plugin {
  return {
    name: 'root-redirect',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '') {
          req.url = '/coverage.html';
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [rootRedirectPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'index.html'),
          coverage: path.resolve(__dirname, 'coverage.html'),
          roster: path.resolve(__dirname, 'roster.html'),
          staff: path.resolve(__dirname, 'staff.html'),
          attendance: path.resolve(__dirname, 'attendance.html'),
          leaveRequests: path.resolve(__dirname, 'leave-requests.html'),
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
