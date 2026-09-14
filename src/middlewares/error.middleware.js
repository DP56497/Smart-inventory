const AppError = require('../utils/AppError');
const { sendError } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  let error = err;

  // Log unexpected errors in non-test environments
  if (process.env.NODE_ENV !== 'test' && (!err.isOperational || err.statusCode === 500)) {
    console.error('Unhandled Error:', err);
  }

  // Handle Mongoose Bad ObjectId
  if (err.name === 'CastError') {
    const message = `Resource not found with id: ${err.value}`;
    error = new AppError(message, 400, 'INVALID_ID');
  }

  // Handle Mongoose Duplicate Key (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const message = `Duplicate value entered for '${field}'. Please use another value.`;
    error = new AppError(message, 409, 'DUPLICATE_RESOURCE');
  }

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((el) => ({
      field: el.path,
      message: el.message
    }));
    error = new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors);
  }

  // Handle Zod Validation Error
  if (err.name === 'ZodError') {
    const errors = (err.issues || []).map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message
    }));
    error = new AppError('Input validation failed', 400, 'VALIDATION_ERROR', errors);
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';
  const code = error.code || 'INTERNAL_ERROR';
  const errors = error.errors || [];

  return sendError(res, {
    statusCode,
    message,
    code,
    errors
  });
};

module.exports = errorHandler;
