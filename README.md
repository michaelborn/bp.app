# bp.app

A simple, offline-first blood pressure tracker. Record systolic and diastolic
readings, see the last two weeks at a glance, and browse your full history —
even without an internet connection. Savings never wait for the network.

> Minimal on purpose. No accounts, no tracking, no cloud — your readings live
> on your device and one server you control.

## Features

- **Two-tap entry** — Record BP opens a compact dialog with the only two
  fields that matter: systolic and diastolic. Date and time are filled in
  automatically.
- **Two-week chart** — Default view plots systolic and diastolic as separate
  series over the most recent 14 days, with a friendly empty state.
- **Full history table** — Tab over to the table for every reading, newest
  first, with a per-row sync badge.
- **Works offline** — After the first visit the app shell is cached by a
  service worker; navigation, charts and entry all work without a network.
- **Queued sync** — Saves land in IndexedDB first, so offline saves succeed
  instantly. Queued records upload on reconnect (online event, periodic
  30 s poll, Background Sync where the browser supports it) and stay visible
  with a *Waiting to sync* badge until the server acknowledges them.
- **Idempotent by design** — Every record gets a client-generated UUID;
  retrying a sync can never produce duplicate rows.
- **Export CSV** — One click downloads your whole history in the same
  `id,recorded_at,systolic,diastolic` format the server persists.
- **Installable PWA** — Standard web manifest, theme colors and icons.

## Getting started

Requires Node.js 20+ (see `.nvmrc`).

```console
$ git clone <your-repo-url> bp.app && cd bp.app
$ npm install
$ npm run dev
```

Open <http://localhost:3000>, hit **Record BP**, and start logging. To use a
writable data file during development:

```console
$ BP_DATA_FILE=/tmp/bp-records.csv npm run dev
```

Production build:

```console
$ npm run build
$ BP_DATA_FILE=./data/bp-records.csv node .output/server/index.mjs
```

`BP_DATA_FILE` — path to the CSV store (default `/data/bp-records.csv`).
Keep it on a persistent volume, not the image. Sensible bounds and formats
are documented in `.env.example`.

## Deploying

The production build is a plain Node/Nitro server, shipped as a small Docker
image (`docker-compose.yml` provided):

1. `docker compose up -d --build`
2. Mount a persistent directory at `/data` and set
   `BP_DATA_FILE=/data/bp-records.csv`.
3. Put it behind any TLS-terminating reverse proxy. Point your chosen
   hostname at the proxy and forward to the container's `PORT` (3000).
   Hostnames are environment/deployment configuration — keep them out of
   this repository.

Service workers require HTTPS, so the offline features activate once the app
is served over a secure context (`localhost` counts for development).

## How it works

```
shared/                     record shape + validation rules (client & server)
services/records.client.ts  typed HTTP client (fetch)
services/records.local.ts   IndexedDB cache + pending-sync queue
composables/useBPRecords.ts local-first records composable (all sync triggers)
server/api/                 GET /api/records · POST /api/records/sync · GET /api/health
server/utils/csvRepository.ts  CSV persistence behind a repository interface
public/bp-sync.js           Background Sync replay inside the service worker
```

The same-origin API validates every record (positive integers, sensible
mmHg bounds, systolic > diastolic, valid UUID and ISO-8601 UTC timestamp)
and returns HTTP 4xx otherwise. Writes are serialized with a process-local
lock; malformed CSV rows are skipped on read and duplicate IDs are ignored —
so a retried sync request acknowledges without duplicating data.

## Testing

```console
$ npm run test     # vitest — CSV repository, validation, idempotent sync, date filtering
$ npm run e2e      # Playwright — dialog, tabs, offline queue, sync and export flows
$ npm run typecheck
```

The Playwright suite builds the production app and exercises it in a real
browser, including offline navigation and reconnect scenarios.

## Contributing

1. Clone the repo and install dependencies (`npm install`, Node 20+).
2. Write code; keep components thin and route data through
   `services/` and `composables/`.
3. Cover behavior with tests: unit tests in `tests/`, end-to-end flows in
   `e2e/`.
4. Run `npm run test`, `npm run e2e` and `npm run typecheck` — keep them
   green before submitting changes.

The server-side persistence sits behind the `RecordsRepository` interface
(`listRecords()` / `insertRecords()`), so alternative backends (e.g. SQLite)
can be swapped in without touching the API contract or UI.

## Status & limitations

This is a proof-of-concept build: single-user, no authentication, and no
edit/delete of records. It is intended to be deployed behind network-level
access restrictions or for personal use. Do not store sensitive data while
the deployment is publicly reachable.

## License

MIT — see [LICENSE](LICENSE).
