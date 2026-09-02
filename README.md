# Rookhposh Dashboard Marketplace

Persian RTL marketplace application with public stores and products, virtual try-on, user and seller dashboards, and a super-admin panel.

## Applications

- `frontend/`: React and Vite web application.
- `backend/`: Node.js and Express API with MySQL persistence and the virtual try-on provider proxy.

## Local validation

```bash
npm test
npm run build
npm audit --prefix frontend --omit=dev --audit-level=high
npm audit --prefix backend --omit=dev --audit-level=high
```

## Production entrypoints

- Web application: `https://dash.rookhposh.ir`
- Health: `https://dash.rookhposh.ir/health`
- API: `/api`
- Virtual try-on provider proxy: `/pro-api`

Production secrets remain only in the server environment and are not part of the frontend or deployment archives.
