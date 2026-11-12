/*
 * Prepares the local dev sandbox in exec/.
 *
 * Creates exec/ and, if it does not exist yet, a server-manager.json derived
 * from the generated template with the overrides a dev box needs:
 *
 *  - prerequisitesMandatory: false  -> skip the apt/VC-Redist runtime lib gate,
 *                                     which no dev machine satisfies
 *  - webPort: 8080                  -> fixed port so the UI dev proxy can target it
 *  - a known admin password         -> so the API is usable without digging in the config
 *
 * An existing exec/server-manager.json is never touched.
 */
const fs = require('fs');
const path = require('path');
const commentJson = require('comment-json');

const root = path.join(__dirname, '..');
const execDir = path.join(root, 'exec');
const configPath = path.join(execDir, 'server-manager.json');
const templatePath = path.join(root, 'build', 'server-manager-template.json');

fs.mkdirSync(execDir, { recursive: true });

if (fs.existsSync(configPath)) {
    console.log(`Keeping existing dev config: ${configPath}`);
    process.exit(0);
}

if (!fs.existsSync(templatePath)) {
    console.error(
        `Config template missing: ${templatePath}\n`
        + 'Run "npm run generator" (or any build) first.',
    );
    process.exit(1);
}

const config = commentJson.parse(fs.readFileSync(templatePath, 'utf8'));

config.prerequisitesMandatory = false;
config.webPort = 8080;
config.admins = [
    {
        userId: 'admin',
        userLevel: 'admin',
        password: 'dev',
    },
];

fs.writeFileSync(configPath, commentJson.stringify(config, null, 2));

console.log(`Created dev config: ${configPath}`);
console.log('Web UI/API: http://127.0.0.1:8080 (admin / dev)');
