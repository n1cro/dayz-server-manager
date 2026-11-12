/*
 * Starts the Angular dev server against the local backend.
 *
 * The default proxy target in ui/proxy.conf.js is "http://localhost:2313".
 * Node resolves "localhost" to ::1 first on many systems (macOS in
 * particular), while the manager binds 127.0.0.1 unless publishWebServer is
 * enabled - the proxy then answers every /api call with a 504. So the target
 * is pinned to IPv4 here.
 *
 * Override with DZSM_HOST to develop against a remote or containerized
 * backend, e.g. DZSM_HOST=http://192.168.1.10:8080 npm run dev:ui
 */
const path = require('path');
const spawn = require('cross-spawn');

const target = process.env.DZSM_HOST || 'http://127.0.0.1:8080';

const result = spawn.sync(
    'npm',
    ['start', '--prefix', 'ui'],
    {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        env: {
            ...process.env,
            DZSM_HOST: target,
        },
    },
);

process.exit(result.status ?? 1);
