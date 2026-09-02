# Project Integrity Baseline

Release scope: production deployment and final validation of the existing Rookhposh marketplace application.

## Applications

- `frontend/`: React/Vite Persian RTL application.
- `backend/`: Node.js/Express API and provider proxy.

## Protected surfaces

- Public store and product pages, virtual try-on flow, camera/upload input, and generated-image download.
- User, seller, and super-admin authentication and dashboards.
- Seller products, store profile, customers, packages, wallet, transactions, tickets, and notifications.
- Super-admin users, products, finance, packages, support, notifications, approval, and export flows.
- Existing `/api`, `/pro-api`, `/uploads`, public store, authentication, health, and payment routes.
- Existing MySQL schema/runtime migrations, uploads, production environment, and provider integrations.

## Deployment files that must be preserved

- Frontend `.htaccess` and all built static assets.
- Backend `.env`, `node_modules`, uploads, database data, and PM2 process configuration.
- Existing API contracts and database compatibility.

## Release preservation policy

- The frontend build is overlaid without deleting unrelated server files.
- Backend source is overlaid after a versioned backup; production secrets and runtime data are not packaged or overwritten.
- Any missing protected surface is a release-blocking regression.
