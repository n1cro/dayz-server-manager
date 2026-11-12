/*
 * Runs the test suite the way CI does, minus the coverage gate.
 *
 * CI=1 is what detectOS() checks to report "windows" (see src/util/detect-os.ts),
 * so without it ~20 platform-dependent specs fail on a non-Windows dev box for
 * reasons that have nothing to do with the code under test.
 *
 * Coverage thresholds are intentionally not enforced here: a few specs cannot
 * pass outside Windows/Linux, so the --functions 100 gate of "npm test" is a
 * CI concern. Use "npm test" before pushing if you want the real gate.
 *
 * Extra arguments are forwarded to mocha, e.g.
 *   npm run test:local -- --grep REST
 */
const path = require('path');
const spawn = require('cross-spawn');

const root = path.join(__dirname, '..');

const result = spawn.sync(
    process.execPath,
    [
        '--no-experimental-strip-types',
        path.join(root, 'node_modules', 'mocha', 'bin', 'mocha.js'),
        ...process.argv.slice(2),
    ],
    {
        cwd: root,
        stdio: 'inherit',
        env: {
            ...process.env,
            CI: '1',
        },
    },
);

process.exit(result.status ?? 1);
