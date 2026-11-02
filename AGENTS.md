# Rookhposh delivery rule

The owner has authorized this standing workflow for this project: after successfully pushing an approved source change to this repository, deploy that same revision to the existing dashboard production service at `dash.rookhposh.ir` on `92.114.51.195`. Do not stop after Push or request a second confirmation for an ordinary deployment.

- Complete relevant tests, lint and the production build before activation. A failed required check blocks deployment until fixed.
- Take and verify a fresh, private backup of the database, active source/build, runtime configuration and private try-on files before changing the active release.
- Use the existing release layout and deploy a matching frontend/backend pair. Drain active operations, apply only compatible additive migrations, check readiness, and keep a data-preserving rollback path.
- Verify HTTPS, the deployed revision, the affected user flows and preservation of existing data after activation.
- Preserve existing AI, SMS and banking settings. Never commit secrets or initiate paid generation, SMS or payments merely as a deployment smoke test.
- Limit production changes to the dashboard. Preserve the main website, CMS, DNS, other services and existing user work.
- Do not force-push or merge branches merely to deploy. Use the pushed revision and existing repository workflow.
