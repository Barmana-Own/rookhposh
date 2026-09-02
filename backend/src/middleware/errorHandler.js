const { localizeErrors, localizeMessage } = require('../utils/messageLocalizer');

function notFound(req, res, next) {
  res.status(404);
  next(new Error(`Route not found: ${req.originalUrl}`));
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.status || (res.statusCode === 200 ? 500 : res.statusCode);
  const isProduction = process.env.NODE_ENV === 'production';

  return res.status(status).json({
    success: false,
    message: isProduction && status === 500
      ? 'خطای داخلی سرور رخ داد. لطفاً دوباره تلاش کنید.'
      : localizeMessage(error.message),
    errors: localizeErrors(error.errors || []),
  });
}

module.exports = { notFound, errorHandler };
