# Stage 11 — Deployment and Production

## Release

- Final release identifier: `20260827-security-deps-r3`
- Core backend release: `20260827-pro-output-final`
- Public health route correction: `20260827-health-route-r2`
- Target: `https://dash.rookhposh.ir`

## Deployment behavior

- The frontend build was overlaid in the existing document root without deleting unrelated files.
- Only the changed backend proxy and final-image selector were overlaid.
- Production `.env`, database data, uploads, dependencies, and existing API contracts were preserved.
- The existing `dash-backend` PM2 process was restarted after server-side syntax checks.
- Every deployment package was SHA-256 checked and archive-tested before extraction.
- Rollback entrypoints were saved below `/home/rookhpos/deploy-backups/` under each release identifier.
- Temporary cron entries used by cPanel deployment were removed and verified absent.

## Production verification

- PM2 process: online after restart.
- Local backend health: PASS.
- Public HTTPS health: PASS with JSON API response.
- Static frontend index and critical try-on chunk: byte-for-byte match with `frontend/dist`.
- Live provider proxy: HTTP 200, `image/webp`, 500×752 final rendered image, not a mask.
- TLS and application security headers: PASS for HSTS, CSP, frame protection, MIME sniffing protection, and referrer policy.

## Rollback

Restore the corresponding backed-up `index.html`, `.htaccess`, and backend proxy files, then restart only `dash-backend`. Database rollback is not required because this release has no schema migration.
