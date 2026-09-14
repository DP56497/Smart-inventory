const sendSuccess = (res, { statusCode = 200, message = 'Success', data = {}, meta = null }) => {
  const responsePayload = {
    success: true,
    message,
    data
  };

  if (meta !== null) {
    responsePayload.meta = meta;
  }

  return res.status(statusCode).json(responsePayload);
};

const sendError = (res, { statusCode = 500, message = 'An unexpected error occurred', code = 'SERVER_ERROR', errors = [] }) => {
  return res.status(statusCode).json({
    success: false,
    message,
    code,
    errors
  });
};

module.exports = {
  sendSuccess,
  sendError
};
