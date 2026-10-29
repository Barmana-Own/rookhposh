const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const sellerRoutes = require('./routes/sellerRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const storeRoutes = require('./routes/storeRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { corsOrigin, jsonLimit, proApiBodyLimit, proApiOrigin, trustProxy } = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { basicRateLimit, hardenHeaders } = require('./middleware/security');
const { createProApiProxy, createProOutputProxy } = require('./middleware/proApiProxy');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', trustProxy);
app.use(helmet());
app.use(hardenHeaders);
app.use(cors({ origin: corsOrigin, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], credentials: true }));
app.use(basicRateLimit);
app.use('/pro-api', express.raw({ type: '*/*', limit: proApiBodyLimit }), createProApiProxy(proApiOrigin));
app.get('/api/pro-output', createProOutputProxy(proApiOrigin));
app.use(express.json({ limit: jsonLimit }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  // Bank callbacks may put a token in the query string; never write it to access logs.
  skip: (req) => /^\/api\/payments\/omidpay\/callback\//i.test(req.originalUrl),
}));

app.use('/api/auth', authRoutes);
app.get('/health', (req, res) => res.json({ success: true, message: 'Marketplace API is healthy' }));
app.use('/api/admin', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use('/api/admin', adminRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/payments', paymentRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
