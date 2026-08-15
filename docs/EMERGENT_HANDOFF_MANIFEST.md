# EMERGENT Source-Only Handoff Manifest

Branch: `emergent/saas-ux-redesign` (never merged into read-only `main`).

This manifest lists **exactly** the source files added or modified by the redesign.
A source-only archive must contain only these files. It must **NOT** include:

- `node_modules/`, `.dart_tool/`, Flutter/Gradle/Xcode build output, `build/`, `dist/`
- APK / AAB / IPA binaries
- `.env*` files, secrets, tokens, keys, Firebase config, production URLs
- caches (`.wrangler/`, `.next/`, `~/.pub-cache`), lockfile-regenerated artifacts
- the `.git/` internals or platform `.emergent/` runtime files
- any real or staging test data / credentials

## Added

| File | Purpose |
| --- | --- |
| `app/login/error-messages.ts` | Pure, dependency-free web login message + validation module. |
| `tests/emergent-login-error-states.test.ts` | Focused tests: login error states + fail-closed access. |
| `docs/EMERGENT_DESIGN_AUDIT.md` | Pre-change architecture & UX audit. |
| `docs/EMERGENT_ROLE_ACCESS_MATRIX.md` | Role → module/feature access matrix. |
| `docs/EMERGENT_UX_CHANGELOG.md` | What changed (presentation/validation only). |
| `docs/EMERGENT_TEST_RESULTS.md` | Test/lint/typecheck/build results. |
| `docs/EMERGENT_EXPORT_INSTRUCTIONS.md` | Export, apply, install, test, build, rollback. |
| `docs/EMERGENT_HANDOFF_MANIFEST.md` | This file. |

## Modified

| File | Change |
| --- | --- |
| `app/login/page.tsx` | Safe error mapping, field validation, password show/hide, help panel, test IDs. |
| `app/login/login.module.css` | Styles for password toggle, field errors, help panel. |
| `mobile/packages/hig_mobile_core/lib/src/hig_mobile_ui.dart` | Shared `HigAuthMessages` + `higFriendlyAuthMessage` + validators. |
| `mobile/packages/hig_mobile_core/lib/hig_mobile_core.dart` | `LoginView`: safe errors, field validation, hide School ID when preconfigured, autofill; sanitised session-restore error. |
| `mobile/driver_gps_app/lib/main.dart` | `DriverLogin`: same safe login treatment + "Need help signing in?"; sanitised restore error. |

## Producing the archive (source-only)

```bash
git checkout emergent/saas-ux-redesign
git archive --format=tar.gz -o emergent-saas-ux-redesign-src.tgz HEAD -- \
  app/login/error-messages.ts \
  app/login/page.tsx \
  app/login/login.module.css \
  mobile/packages/hig_mobile_core/lib/src/hig_mobile_ui.dart \
  mobile/packages/hig_mobile_core/lib/hig_mobile_core.dart \
  mobile/driver_gps_app/lib/main.dart \
  tests/emergent-login-error-states.test.ts \
  docs/EMERGENT_DESIGN_AUDIT.md \
  docs/EMERGENT_ROLE_ACCESS_MATRIX.md \
  docs/EMERGENT_UX_CHANGELOG.md \
  docs/EMERGENT_TEST_RESULTS.md \
  docs/EMERGENT_EXPORT_INSTRUCTIONS.md \
  docs/EMERGENT_HANDOFF_MANIFEST.md
```

`git archive` reads only committed tree contents, so it inherently excludes
`node_modules`, build output, secrets and caches. Verify with:

```bash
tar -tzf emergent-saas-ux-redesign-src.tgz
```
