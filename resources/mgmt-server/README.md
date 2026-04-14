# Hermes Management API Server

This is the canonical source of `hermes-mgmt-server.js`, a small Node.js HTTP
server that Hermes Desktop uses to manage a remote Hermes Agent over
Tailscale / LAN.

## What it does

Exposes these endpoints on port `8643` (configurable via `MGMT_PORT`):

| Method | Path              | Purpose                                            |
| ------ | ----------------- | -------------------------------------------------- |
| GET    | `/health`         | Liveness + platform identifier (public, no auth)   |
| GET    | `/version`        | Current Hermes Agent version                       |
| GET    | `/check-update`   | Compare HEAD against latest tag on origin          |
| POST   | `/update`         | `git stash && fetch && checkout <latest-tag>`      |
| GET    | `/config/yaml`    | Read `~/.hermes/config.yaml`                       |
| PUT    | `/config/yaml`    | Write `~/.hermes/config.yaml`                      |
| GET    | `/config/env`     | Read `~/.hermes/.env`                              |
| PUT    | `/config/env`     | Write `~/.hermes/.env`                             |
| POST   | `/restart`        | `launchctl kickstart -k gui/<uid>/ai.hermes.gateway` |
| GET    | `/conversations`  | Read `~/.hermes/desktop-conversations.json`        |
| PUT    | `/conversations`  | Write `~/.hermes/desktop-conversations.json`       |

Auth: bearer token, read from `API_SERVER_KEY` in `~/.hermes/.env` at startup
(and refreshed every 30 seconds). If the key is absent the server runs open.

## Why it exists

Hermes Desktop is a client that can connect to a remote Hermes Agent over
its REST API. That API handles **conversation traffic**, but it doesn't
expose **host management** — you can't restart the agent, bump its version,
or edit its config files through it. This tiny sidecar fills that gap so
the Desktop's Settings page works the same way whether you're connected
to localhost or a machine across Tailscale.

On the Desktop side, see `mgmtFetch()` and the `probeMgmtApi()` logic in
`src/renderer/src/views/settings/SettingsPage.vue`.

## Installing on a remote machine (macOS)

From a clone of `hermes-desktop`:

```bash
bash scripts/install-mgmt-server.sh
```

The script:

1. Copies `resources/mgmt-server/hermes-mgmt-server.js` → `~/.hermes/hermes-mgmt-server.js`
2. Renders `ai.hermes.mgmt.plist.template` → `~/Library/LaunchAgents/ai.hermes.mgmt.plist`
3. `launchctl bootstrap` + `kickstart` so it's running now and on every login
4. Pings `http://127.0.0.1:8643/health` to verify

Uninstall:

```bash
bash scripts/install-mgmt-server.sh uninstall
```

## Robustness features

The server serializes all git operations behind a mutex (`withGitLock`)
so `check-update` and `update` can't race on `.git/index`. Transient
`git fetch` failures (DNS blips, connection resets, cold-cache
timeouts) are retried once with a short backoff. `execFile` timeouts
are classified separately from other errors so the client sees a
clear `"timed out after 60000ms"` message instead of an opaque
`"Command failed: git ..."` string. Annotated tags are dereferenced
via `${tag}^{commit}` when comparing against HEAD so "already up to
date" detection works correctly.

## Updating an already-installed mgmt-server

Re-run the installer. It's idempotent: it backs up the existing
`hermes-mgmt-server.js` to `*.bak.<timestamp>` and reloads the
launchd job so the new code takes effect immediately.
