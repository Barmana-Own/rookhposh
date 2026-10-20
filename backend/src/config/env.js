require('dotenv').config();
const truthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

if (process.env.NODE_ENV === 'production' && truthy(process.env.OMIDPAY_ENABLED)
    && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-this-secret' || process.env.JWT_SECRET.length < 32)) {
  throw new Error('A private JWT_SECRET of at least 32 characters is required before enabling production payments.');
}

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
  unlimitedProUserMobiles: process.env.PRO_UNLIMITED_USER_MOBILES ?? '09037862349',
  omidpay: {
    enabled: truthy(process.env.OMIDPAY_ENABLED),
    terminalId: process.env.OMIDPAY_TERMINAL_ID || '',
    merchantId: process.env.OMIDPAY_MERCHANT_ID || '',
    userId: process.env.OMIDPAY_USER_ID || '',
    password: process.env.OMIDPAY_PASSWORD || '',
    callbackBaseUrl: process.env.OMIDPAY_CALLBACK_BASE_URL || '',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'marketplace',
    port: Number(process.env.DB_PORT || 3306),
    charset: 'utf8mb4',
  },
};
