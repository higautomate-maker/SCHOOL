# EMERGENT Export & Apply Instructions

How to obtain the redesigned source, apply it to the original repository, install,
test, build (web + the three Flutter apps), and roll back. No secrets are included;
you must supply your own environment values as usual.

Repository: `https://github.com/higautomate-maker/SCHOOL`
Baseline (read-only): `main`  ·  Working branch: `emergent/saas-ux-redesign`

---

## Option A — Use the published branch / PR (recommended)

The work is delivered as the branch **`emergent/saas-ux-redesign`**, opened as a
pull request into `main` (do not merge into `main` until reviewed).

```bash
git fetch origin
git checkout emergent/saas-ux-redesign
# Review the diff against the read-only baseline:
git diff main...emergent/saas-ux-redesign
```

## Option B — Apply as a patch to a fresh clone

```bash
git clone https://github.com/higautomate-maker/SCHOOL.git
cd SCHOOL
git checkout main
git checkout -b emergent/saas-ux-redesign

# Generate a patch from the delivered branch (on the machine that has it):
#   git diff main...emergent/saas-ux-redesign > emergent-ux.patch
# Then apply here:
git apply --index emergent-ux.patch
git commit -m "Apply Emergent SaaS UX redesign (login safety + docs + tests)"
```

## Option C — Source-only archive

If you received a source archive, expand it over a clean `main` checkout. The
archive contains **only** the files listed in `docs/EMERGENT_HANDOFF_MANIFEST.md`
(no dependencies, build output, APKs, secrets, caches or env files).

```bash
git checkout main && git checkout -b emergent/saas-ux-redesign
tar -xzf emergent-saas-ux-redesign-src.tgz    # extract at repo root
git add -A && git status                       # confirm only manifest files changed
git commit -m "Apply Emergent SaaS UX redesign"
```

---

## Install dependencies

```bash
# Node 22.13+ required (see .nvmrc). If using nvm:  nvm install && nvm use
npm ci        # or: npm install
```

Create your local env from the examples (never commit these):
```bash
cp .env.example .env.local     # fill in your own values
```

## Run tests

```bash
npm run test:unit    # full unit suite (expected: pass, with 14 pre-existing todos)
npm run typecheck
npm run lint

# Run only the new focused login/access tests:
node --experimental-strip-types --test tests/emergent-login-error-states.test.ts

# Optional (needs provisioned services + secrets):
npm run test:integration:auth
```

## Build the web app

```bash
npm run build            # Cloudflare/vinext build
# Node/Hostinger target:
npm run build:hostinger
```

## Build the three Flutter apps

```bash
# One-time platform bootstrap if needed:
bash mobile/scripts/bootstrap_flutter_platforms.sh
bash mobile/scripts/validate_flutter_apps.sh    # flutter pub get + analyze for all apps

for app in student_parent_app staff_admin_app driver_gps_app; do
  ( cd "mobile/$app" && flutter pub get && flutter analyze )
done

# Release builds — provide your own API base URL and (optionally) a preconfigured
# School ID. When HIG_TENANT_ID is supplied, the School ID field is hidden in login.
cd mobile/student_parent_app
flutter build apk \
  --dart-define=API_BASE_URL=https://<your-api-host> \
  --dart-define=HIG_TENANT_ID=<optional-school-tenant-id>
# Repeat for staff_admin_app and driver_gps_app.
```
Signed APK/AAB/IPA must be produced with the customer's own signing identities.

## Roll back

This branch never touches `main`, so rollback is simply not merging, or:

```bash
# Discard the branch entirely:
git checkout main
git branch -D emergent/saas-ux-redesign          # local
git push origin --delete emergent/saas-ux-redesign   # remote (if pushed)

# Or revert an applied patch/commit on a working branch:
git revert <commit-sha>
```

No migrations were applied and no data changed, so there is nothing to roll back at
the database layer.
