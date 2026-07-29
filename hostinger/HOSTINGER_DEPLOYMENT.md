# Hostinger deployment — Hig School

## Supported Hostinger service

Use a Hostinger VPS with Docker and the Docker Compose plugin. PHP-only shared hosting cannot run this server.

The Hostinger image is a dedicated Node target:

- `HIG_RUNTIME=node` excludes the Cloudflare Vite plugin and resolves the database contract to Node SQLite.
- `HIG_DEMO_DB_PATH=/data/hig-school-demo.sqlite` stores synchronized demo state on the persistent volume.
- `HIG_SQLITE_MIGRATIONS_PATH=/app/drizzle` initializes the normalized school API tables.
- The Cloudflare D1 implementation remains isolated in `db/adapters/cloudflare-d1.ts` and is not present in the Hostinger production bundle.

SQLite is supported here for the single-server sales demonstration. Use the Stage 2 PostgreSQL adapter before storing production school data or scaling to multiple application containers.

## Upload package

1. Upload `hig-school-hostinger-node-fixed-v3.zip` to the VPS.
2. Extract it into a dedicated directory:

   ```bash
   mkdir -p /opt/hig-school
   unzip hig-school-hostinger-node-fixed-v3.zip -d /opt/hig-school
   cd /opt/hig-school
   ```

3. Confirm these files exist:

   ```bash
   test -f Dockerfile
   test -f hostinger/docker-compose.yml
   test -f package-lock.json
   test -d drizzle
   ```

## Build and start

```bash
docker compose -f hostinger/docker-compose.yml build --no-cache
docker compose -f hostinger/docker-compose.yml up -d
docker compose -f hostinger/docker-compose.yml ps
```

Wait until `hig-school` reports `healthy`.

Do not use `--force`, `--legacy-peer-deps`, or edit the lockfile on the server. The image uses `npm ci` and the checked-in lockfile.

## Verify the deployment

From the VPS:

```bash
curl -fsS http://127.0.0.1:3000/api/v1/health
curl -fsSI http://127.0.0.1:3000/login
docker inspect --format '{{.State.Health.Status}}' hig-school
docker logs --tail 100 hig-school
```

Expected health response includes:

```json
{"status":"ok","service":"hig-school"}
```

The container status must be `healthy`, and the logs must not contain `ERR_UNSUPPORTED_ESM_URL_SCHEME` or `cloudflare:`.

## Verify persistent data

1. Sign in as the School demo account.
2. Add a notice, student, attendance entry, or other demo record.
3. Restart the container:

   ```bash
   docker restart hig-school
   ```

4. Wait for it to become healthy and sign in again. The record must still exist.

The named volume `hig-school-data` owns `/data`. Normal container rebuilds and restarts preserve it. Do not run `docker compose down -v` unless you intentionally want to delete all demo data.

Back up the demo database with:

```bash
docker cp hig-school:/data/hig-school-demo.sqlite ./hig-school-demo-backup.sqlite
```

## Domain and TLS

Point the Hostinger domain to the VPS and reverse-proxy HTTPS traffic to `127.0.0.1:3000`. A starting Nginx configuration is provided in `hostinger/nginx.conf.example`.

Enable TLS in hPanel or Certbot, then open:

```text
https://your-domain.example/login
```

## Updates

```bash
cd /opt/hig-school
docker compose -f hostinger/docker-compose.yml build --no-cache
docker compose -f hostinger/docker-compose.yml up -d
docker compose -f hostinger/docker-compose.yml ps
```

The persistent volume is reused automatically.

## Local/CI acceptance command

On any machine with Docker:

```bash
npm ci
npm run test:integration:hostinger
```

This command builds the image, starts it on a temporary port and volume, waits for Docker health, requests the health and login pages, writes a record, restarts the container, and verifies that the record survived.

CI also performs:

```bash
npm run build:hostinger
npm run check:hostinger-bundle
```

The second command fails if any `cloudflare:` runtime reference is found in `dist`.

## Mobile API URL

Build each Flutter app with the hosted HTTPS origin:

```bash
flutter build apk --dart-define=API_BASE_URL=https://school.example.com
flutter build appbundle --dart-define=API_BASE_URL=https://school.example.com
flutter build ios --dart-define=API_BASE_URL=https://school.example.com
```

## Production-data warning

The included credentials and SQLite data are demonstration-only. Production launch still requires Auth.js/identity hardening, MFA, rate limits, managed PostgreSQL, backups/PITR, secrets management, audit retention, and signed mobile releases.
