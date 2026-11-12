# Development

Practical runbook for working on this fork. The short version: write code on
whatever machine you like, run the backend and UI locally, and leave the
Windows executable to CI.

---

## 1. Install

Node.js 24 and npm 11 are required (`engines` / `packageManager` in
`package.json`). Native modules are compiled locally, so you also need a C++
toolchain:

* **macOS** — `xcode-select --install`
* **Linux** — `apt-get install -y make python3 build-essential`
* **Windows** — `choco install python visualstudio2022-workload-vctools -y`

Then:

```bash
corepack enable npm
npm ci
```

> **npm 12 blocks install scripts.** If you run the repo with npm 12 or newer,
> `npm ci` silently skips the `node-gyp` builds and leaves
> `node_modules/better-sqlite3/build/Release/` empty — the manager then crashes
> on startup. `corepack enable npm` pins npm to the 11.6.2 declared in
> `packageManager` and avoids this. To check: `npm install-scripts ls` should
> not list `better-sqlite3`. To recover without corepack:
> `npx -y npm@11.6.2 rebuild better-sqlite3 node-pty`.

The root `postinstall` installs the UI dependencies too — do not run a second
install inside `ui/`.

---

## 2. What runs where

The manager supervises a DayZ server process, so part of the codebase is bound
to the host OS. Everything in tier 1 runs fine on any dev machine; tier 2 is
written and unit-tested locally but can only be verified against a real server.

### Tier 1 — develop and run locally, any OS

REST/ingame API, auth, websockets · config layer and JSON-schema generation ·
SQLite database · metrics · Discord bot · fleet / multi-node · event bus,
operations, logging, downloads · all of `src/util` and `src/types` · the entire
Angular UI.

### Tier 2 — write locally, verify on Windows (or Linux)

| Area | Files | Unit test |
|---|---|---|
| Process list | `src/services/processes.ts` | `test/services/processes.test.ts` |
| Server detection / start | `src/services/server-detector.ts`, `server-starter.ts` | — |
| Monitor loop | `src/services/monitor.ts` | `test/services/monitor.test.ts` |
| steamcmd | `src/services/steamcmd.ts` | `test/services/steamcmd.test.ts` |
| Firewall | `src/services/netsh.ts` | `test/services/netsh.test.ts` |
| Requirements gate | `src/services/requirements.ts` | `test/services/requirements.test.ts` |
| RCon / BattlEye | `src/services/rcon.ts` | `test/services/rcon.test.ts` |
| Log reader | `src/services/log-reader.ts` | `test/services/log-reader.test.ts` |
| Backups, missions, hooks | `src/services/backups.ts`, `mission-files.ts`, `hooks.ts` | all three |
| Ingame report | `src/services/ingame-report.ts`, `syberia-compat.ts` | `test/services/ingame-report.test.ts` |

These all have mocked unit tests, so the logic is debuggable locally; only the
integration needs a real host.

`detectOS()` (`src/util/detect-os.ts`) maps `darwin` and the BSDs onto `linux`,
and reports `windows` whenever `CI` is set in the environment.

### Tier 3 — Windows or Linux only

The three Enforce Script PBOs under `watcher_mod/` are built with Mikero's
`makepbo`, which has no macOS build. You can edit the `.c` sources anywhere,
but `npm run build:pbos` (and therefore the full `npm run build`) only works
where `makepbo` is on `PATH`. CI covers this.

---

## 3. The local dev loop

Three terminals:

```bash
npm run dev:tsc
```

```bash
npm run dev:backend
```

```bash
npm run dev:ui
```

* **`dev:tsc`** — `tsc --watch`, recompiles `src/` into `dist/` on save.
* **`dev:backend`** — prepares `exec/`, then runs `node --watch dist/index.js
  --skip-init`, restarting whenever `dist/` changes. Serves the API and the
  last built UI on <http://127.0.0.1:8080>.
* **`dev:ui`** — Angular dev server on <http://localhost:4200> with hot reload,
  proxying `/api` and `/version` to the backend.

Credentials for both: `admin` / `dev`.

Use port 4200 when you are working on the frontend and 8080 when you only care
about the backend. `npm run dev:backend:once` is the same as `dev:backend`
without the watcher, which is easier to attach a debugger to.

### `--skip-init`

`--skip-init` skips the runtime-requirements gate and the initial server
detection (`src/control/manager-controller.ts`). Without it the manager refuses
to boot on a machine that has no DayZ server installed. It is a dev flag only —
never pass it in production.

### The `exec/` sandbox

`npm run dev:setup` (called by both backend scripts) creates `exec/` and, on
first run, a `server-manager.json` from the generated template with three
overrides: `prerequisitesMandatory: false`, `webPort: 8080`, and the
`admin`/`dev` account. An existing config is never overwritten — edit it
freely, and delete it to regenerate.

`exec/` is gitignored. The manager watches the config file and reloads itself
on change.

---

## 4. Tests and lint

```bash
npm run test:local
```

Runs the suite with `CI=1` and no coverage gate. Append mocha arguments after
`--`, e.g. `npm run test:local -- --grep REST`.

```bash
npm test
```

The real gate, as CI runs it: coverage with `--lines 85 --functions 100`.

```bash
npm run lint
npm run lint --prefix ui
```

**Expect 3 failures of `test:local` on macOS**, all environmental:
`ProcessesSpawner-spawnForOutputPty` (`posix_spawnp failed`) and two websocket
timing specs in `test/interface/rest.test.ts`. They pass on Windows and Linux.
Because of them the `--functions 100` threshold cannot be met on macOS — treat
coverage as a CI signal.

Without `CI=1` roughly twenty specs fail, because `detectOS()` then reports
`linux` and the platform branches under test take the wrong path. Always go
through `test:local`.

---

## 5. Builds

| Command | macOS | Linux | Windows |
|---|---|---|---|
| `npm run build-backend-only` | yes | yes | yes |
| `npm run build:ui` | yes | yes | yes |
| `npm run build:pbos` | no | yes | yes |
| `npm run build` | no | yes | yes |
| `npm run pack:windows` | see below | yes | yes |

For day-to-day work you never need a full build — `dev:tsc` is enough. When you
do want the bundled UI served from port 8080:

```bash
npm run build-backend-only && npm run build:ui
```

### Shipping an executable

Let GitHub Actions do it. `.github/workflows` builds the Windows and Linux
binaries with Mikero's tools available, which is the only way to get the PBOs
into the artifact. Download the artifact and test it on a real Windows box.

### Packing locally (and why to avoid it on macOS)

`npm run pack:windows` produces a valid `build/dayz-server-manager.exe` even
from macOS, but it is **broken at runtime**: `pkg.assets` embeds
`node_modules/better-sqlite3/build/Release/better_sqlite3.node`, which on a Mac
is a Mach-O binary. The database fails to load on Windows. The build also
misses `dist/mods`, so ingame-report features are absent.

If you really need a local Windows pack, swap in the matching prebuild first
(Node 24 is ABI 137):

```bash
curl -L -o /tmp/bs3-win.tar.gz https://github.com/WiseLibs/better-sqlite3/releases/download/v12.11.1/better-sqlite3-v12.11.1-node-v137-win32-x64.tar.gz
mkdir -p /tmp/bs3-win && tar -xzf /tmp/bs3-win.tar.gz -C /tmp/bs3-win
cp /tmp/bs3-win/build/Release/better_sqlite3.node node_modules/better-sqlite3/build/Release/
npm run pack:windows
```

Afterwards restore your local build, or the manager stops running on this
machine:

```bash
npx -y npm@11.6.2 rebuild better-sqlite3
```

`node-pty` needs no such treatment — it ships complete `prebuilds/win32-x64`
binaries that `pkg` picks up as-is.

---

## 6. Running against a real server

For anything in tier 2 you need a host that can actually run DayZ:

* **Windows** — build on CI, download the artifact, run the `.exe` next to a
  `server-manager.json`.
* **Linux / Docker** — `docker-compose.yml` runs the published image with the
  working directory mounted at `/dayz`. Point the `image:` at your own build to
  test fork changes.

The UI dev server can target a remote backend, so you can keep hot reload while
the manager runs elsewhere:

```bash
DZSM_HOST=http://192.168.1.10:8080 npm run dev:ui
```

That backend needs `publishWebServer: true` in its config to listen on
`0.0.0.0` instead of loopback.

---

## 7. Known gotchas

**`ENOENT: scandir '/proc'` every monitor tick on macOS.** Expected. The
process fetcher reads `/proc` on Unix and shells out to PowerShell on Windows;
macOS has neither. The error is logged and swallowed, the manager keeps
running, and the server state stays `STOPPED`.

**All `/api` calls through port 4200 return 504.** The proxy target resolved to
IPv6 while the backend listens on `127.0.0.1`. `dev:ui` pins IPv4 already; if
you set `DZSM_HOST` yourself, use `127.0.0.1`, not `localhost`.

**`npm run build` fails at `build:pbos`.** No `makepbo` on `PATH`. Use
`build-backend-only` plus `build:ui`.

**`ng serve` rejects `angular.json`.** Angular 17 renamed `browserTarget` to
`buildTarget`; it is fixed in this fork, but a rebase onto upstream may bring
the old keys back.

**`better_sqlite3.node` not found / wrong ELF header.** The npm 12 install-script
block, or a Windows prebuild left in place after a local pack. Run
`npx -y npm@11.6.2 rebuild better-sqlite3`.
