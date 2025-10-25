export const sendSuccess = (res, data, message = 'Success', statusCode = 200) => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const sendError = (res, message = 'Error', statusCode = 400, errors = null) => {
  res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};

export const sendPaginatedSuccess = (res, data, pagination, message = 'Success') => {
  res.json({
    success: true,
    message,
    data,
    pagination,
  });
};

export default {
  sendSuccess,
  sendError,
  sendPaginatedSuccess,
};