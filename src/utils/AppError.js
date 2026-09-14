class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
