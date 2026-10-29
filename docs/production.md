# Ubuntu production deployment

The repository is the source of truth for the dashboard. Create a release from a Git commit, build its frontend, and deploy that build. Do not edit `frontend/dist` or the live HTML directly. Keep the selected commit SHA with the release so GitHub, source files, and deployed assets can be compared.

## Build and configuration

Use the checked-in lockfiles with Node.js 22 and `npm ci` in the root, backend, and frontend directories. Run `npm run lint`, `npm run test:unit`, and `npm run build` from the repository root. This JavaScript project has no separate TypeScript typecheck command.

The frontend uses these public build variables:

```dotenv
VITE_API_BASE_URL=
VITE_PRO_API_URL=/pro-api/try-on
VITE_PRO_API_M1_URL=/pro-api/m1
VITE_PRO_API_M2_URL=/pro-api/m2
```

Backend credentials and signing keys remain in `/etc/rookhposh-dash/backend.env`, outside the checkout. Preserve the existing database, uploads, image-provider configuration, and private environment when deploying. Do not run the sample SQL seed files against production.

## Nginx

The `deploy/nginx` directory contains the dashboard's current site and supporting snippets. Install the site as `/etc/nginx/sites-available/rookhposh-dash` and the snippets under `/etc/nginx/snippets/`. The TLS snippet references existing certificate files; private keys are never included in this repository. Back up existing configuration before replacing it, validate with `nginx -t`, and reload Nginx only after validation succeeds.

The site serves `/var/www/rookhposh-dash/current`, forwards API calls to the private backend on port 5050, and preserves the current image endpoints. Only the dashboard virtual host should change. Keep port 5050 restricted to local access with the existing dashboard firewall service. Leave the root-domain website, CMS, DNS, and other services intact.

## Kavenegar web push

`frontend/index.html` includes the supplied deferred Kavenegar page SDK in `<head>`. The public app ID is part of the client configuration; it is not an SMS API key.

`frontend/public/kvn-push-sw.js` is the official downloaded file, unchanged:

```javascript
importScripts("https://cdn.kavenegar.com/sdk/sw.js");
```

Its SHA-256 is `3df9c9ac3c0d3498e5fb7beaa10a421f4cdf94ba83d8ca9f5b14317952baacd9`. Vite copies it to the root of the build. After deployment, `https://dash.rookhposh.ir/kvn-push-sw.js` must return those exact bytes as JavaScript, with cache revalidation. The Nginx template allows the required Kavenegar script and connection origins in CSP while retaining the existing protections.

Complete the connection check in the authenticated Kavenegar console after installing the website files. Browser registration and notification delivery need a separate live check; HTTP availability alone does not verify them.

## Temporary OTP mode

At the owner's request, the current site template temporarily allows the existing test-code request and verification endpoints, with POST-only access, a small request-body limit, rate limits, and no-store responses. The frontend displays the returned test code. This mode sends no SMS and does not verify ownership of a phone number. Administrator password login remains separate. Real SMS OTP still requires the private Kavenegar API key and verification template; the web-push app ID does not provide either.

## Release checks and rollback

Before activation, back up the current frontend, Nginx configuration, and dashboard database. Check the release source against its Git commit, verify the worker hash and HTML script, and confirm that the production build succeeds. Activate a complete build through an atomic update of the frontend symlink, then verify HTTPS health, login, API access, static assets, CSP, and the unchanged root website and CMS.

Retain the previous release and configuration. If activation fails, restore the previous frontend symlink and dashboard configuration, validate Nginx, and reload it. This frontend integration does not require a database migration.
