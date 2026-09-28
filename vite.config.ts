import path from 'path';
import {defineConfig, Plugin} from 'vite';

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
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          coverage: path.resolve(import.meta.dirname, 'coverage.html'),
          roster: path.resolve(import.meta.dirname, 'roster.html'),
          staff: path.resolve(import.meta.dirname, 'staff.html'),
          attendance: path.resolve(import.meta.dirname, 'attendance.html'),
          leaveRequests: path.resolve(import.meta.dirname, 'leave-requests.html'),
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
