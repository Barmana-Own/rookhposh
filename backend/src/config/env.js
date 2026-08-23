require('dotenv').config();
const truthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

module.exports = {
  port: process.env.PORT || 5050,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jsonLimit: process.env.JSON_LIMIT || '10mb',
  proApiBodyLimit: process.env.PRO_API_BODY_LIMIT || '30mb',
  proApiOrigin: process.env.PRO_API_ORIGIN || 'http://91.107.232.169:6000',
  trustProxy: truthy(process.env.TRUST_PROXY),
  jwtSecret: process.env.JWT_SECRET || 'change-this-secret',
  jwtUserExpiresIn: process.env.JWT_USER_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '30d',
  jwtAdminExpiresIn: process.env.JWT_ADMIN_EXPIRES_IN || '24h',
  db: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'marketplace',
    port: Number(process.env.DB_PORT || 3306),
    charset: 'utf8mb4',
  },
};
