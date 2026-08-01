# Hostinger upload and SQL checklist

## 1. Hosting plan required

Use a **Hostinger VPS with Docker support**. A PHP-only shared hosting plan cannot run the Hig School Node/Vinext APIs or live mobile synchronization.

## 2. File to upload

Upload and extract:

`Hig-School-Hostinger-Connected-v1.1.0.zip`

Important included files:

- `Dockerfile`
- `hostinger/docker-compose.yml`
- `hostinger/nginx.conf.example`
- `DEMO_CREDENTIALS.md`
- `mobile/student_parent_app`
- `mobile/staff_admin_app`
- `mobile/driver_gps_app`

## 3. Start the web portals and API

After connecting to the VPS through SSH:

```bash
cd /path/to/extracted/hig-school
docker compose -f hostinger/docker-compose.yml up -d --build
docker compose -f hostinger/docker-compose.yml ps
curl http://127.0.0.1:3000/api/v1/health
```

The application listens on VPS port `3000`.

## 4. Domain and SSL

1. Point the chosen domain or subdomain A record to the VPS IP.
2. Replace `school.example.com` in `hostinger/nginx.conf.example`.
3. Install the Nginx configuration.
4. Enable SSL through Hostinger or Certbot.
5. Open `https://your-domain.example/login`.

## 5. SQL requirement for the demonstration

**No manual SQL import is required for the demonstration version.**

The app automatically creates the SQLite table defined in `hostinger/demo-persistence.sql`. The database is stored in the Docker volume `hig-school-data` at `/data/hig-school-demo.sqlite`.

Demo accounts, sample students, attendance, fees, homework, notices, module policies, GPS updates and cross-role notifications are seeded on first launch. New changes survive container restarts and image rebuilds.

The files under `drizzle/*.sql` target Cloudflare D1/SQLite. They are not Hostinger MySQL dumps and must not be imported through phpMyAdmin.

To intentionally reset the sales demo, remove its Docker volume and start it again:

```bash
docker compose -f hostinger/docker-compose.yml down
docker volume rm hig-school_hig-school-data
docker compose -f hostinger/docker-compose.yml up -d --build
```

## 6. Production SQL requirement

Before storing real school records, a MySQL or PostgreSQL production adapter must replace the SQLite demonstration snapshot store and Cloudflare D1 adapter. Production work includes:

- MySQL/PostgreSQL schema and migration scripts.
- Persistent tenant-scoped repositories for every operational workflow.
- Password hashing, managed sessions, password recovery and MFA.
- Database backups and restore testing.
- Audit retention, rate limits and secret management.
- Migration of demo API actions to transactional database writes.

Until this work is completed, deploy this package only as a demonstration.

## 7. Sales-demo login accounts

Provision sales-demo accounts through the hosting secret manager using
`HIG_DEMO_ACCOUNTS_JSON`. No email, password, or static bearer token is stored
in this package. Never put the generated values in SQL, Git, documentation, or
chat. Real Stage 7 web accounts must be created through bootstrap/invitations.

## 8. Connect and build the mobile apps

Flutter 3.24 or newer is required on the mobile build machine. Build each app with the same HTTPS domain used by the web portal:

```bash
cd mobile/student_parent_app
flutter create . --platforms=android,ios --org com.higautomation
flutter pub get
flutter build appbundle --dart-define=API_BASE_URL=https://your-domain.example

cd ../staff_admin_app
flutter create . --platforms=android,ios --org com.higautomation
flutter pub get
flutter build appbundle --dart-define=API_BASE_URL=https://your-domain.example

cd ../driver_gps_app
flutter create . --platforms=android,ios --org com.higautomation
flutter pub get
flutter build appbundle --dart-define=API_BASE_URL=https://your-domain.example
```

For iOS, configure the Apple signing team and run:

```bash
flutter build ipa --dart-define=API_BASE_URL=https://your-domain.example
```

The Driver app also requires Android background/fine-location permissions and the matching iOS location descriptions and background mode.

## 9. Demonstrate live synchronization

1. Company disables a module for Northfield Public School.
2. School navigation and matching role-app launchers remove that module.
3. Teacher marks attendance or publishes homework.
4. Student and Parent accounts receive the updated information.
5. Driver updates GPS/trip status.
6. Student and Parent transport screens receive the new trip state.
