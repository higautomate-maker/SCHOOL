# Hostinger deployment — Hig School

## Required Hostinger plan

Use a Hostinger VPS with Docker or a Hostinger plan that supports persistent Node.js processes. Traditional PHP-only shared hosting cannot run this Next/Vinext server or its synchronized APIs.

## Demo deployment

1. Upload the extracted project to the VPS.
2. Install Docker and the Docker Compose plugin.
3. From the project directory run:

   ```bash
   docker compose -f hostinger/docker-compose.yml up -d --build
   ```

4. Add the domain in Hostinger and reverse-proxy it to port `3000`. An Nginx example is included in `hostinger/nginx.conf.example`.
5. Enable SSL in hPanel or Certbot.
6. Open `https://your-domain.example/login`.

The connected demonstration state is stored in SQLite at `/data/hig-school-demo.sqlite`. Docker Compose mounts the named `hig-school-data` volume, so attendance, homework, fees, module policies, requests, GPS updates and notifications survive container rebuilds and restarts.

## Production data

The durable SQLite state is appropriate for a single-server sales demonstration. Before storing real school records, replace the snapshot store with normalized managed PostgreSQL or MySQL repositories. Do not use the demo passwords for real users.

Production launch also requires:

- Managed identity provider or secure password hashing.
- MFA for Company and School administrators.
- HTTPS-only secure sessions and session rotation.
- Database backups and point-in-time recovery.
- Rate limiting, email/SMS provider configuration and audit retention.
- Android and iOS signing keys, privacy disclosures and store review.

## Mobile API URL

Build each Flutter app with the hosted HTTPS origin:

```bash
flutter build apk --dart-define=API_BASE_URL=https://school.example.com
flutter build appbundle --dart-define=API_BASE_URL=https://school.example.com
flutter build ios --dart-define=API_BASE_URL=https://school.example.com
```
