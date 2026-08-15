# EMERGENT Login Review Pack — Before / After Screenshots

Captured locally with headless Chrome against a **local** dev server
(`http://localhost:3000`) using the reproducible script
`scripts/emergent-screenshots.mjs`. **Only synthetic data is used** — no real
school names, emails, tenant IDs, passwords, tokens, API URLs, or
staging/production data appears in any image or in this repository.

Synthetic values used: email `teacher@demo-school.test`, password
`synthetic-password-123`, reset/invitation token `synthetic-demo-token`.

| Screen | Before (`main`) | After (redesign) |
| --- | --- | --- |
| Login (default) | `before/login-01-default.png` | `after/login-01-default.png` |
| Login (field validation) | `before/login-02-validation.png` | `after/login-02-validation.png` |
| Login (help panel + password reveal) | `before/login-03-help-reveal.png` | `after/login-03-help-reveal.png` |
| Login (mobile) | `before/login-04-mobile.png` | `after/login-04-mobile.png` |
| Forgot password | `before/forgot-01-default.png` | `after/forgot-01-default.png` |
| Reset password | `before/reset-01-default.png` | `after/reset-01-default.png` |
| Invitation accept | `before/accept-01-default.png` | `after/accept-01-default.png` |

## What the "after" set demonstrates
- **Password reset / invitation-accept** move from bare, unstyled forms to a
  polished, branded, accessible card consistent with the login.
- **Password show/hide** control on login, reset and invitation screens.
- **"Need help signing in?"** guidance panel with plain-language steps.
- **Enumeration-safe** copy (e.g. "we never confirm whether an email address has
  an account", "invalid or expired" for reset/invitation).
- Client-side **field validation** before any request is sent.

## Reproduce

```bash
npm run build        # or: npx vinext dev --port 3000 --ip 0.0.0.0
# with the app served on http://localhost:3000:
node scripts/emergent-screenshots.mjs docs/screenshots/after
```
(The script auto-detects Chrome at `/usr/bin/google-chrome`.)
