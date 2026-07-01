class appError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
      this.isOperational = true; // marks this as a "safe to show" error
      Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = appError;