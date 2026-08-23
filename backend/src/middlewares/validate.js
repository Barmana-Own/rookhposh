const { validationResult } = require('express-validator');
const ApiError = require('../utils/apiError');

module.exports = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  return next(new ApiError(422, 'اطلاعات وارد شده معتبر نیست.', result.array().map((error) => ({ field: error.path, message: error.msg }))));
};
