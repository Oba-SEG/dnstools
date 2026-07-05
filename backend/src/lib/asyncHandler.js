'use strict';

/**
 * Wraps an async Express route handler so rejected promises are forwarded
 * to Express's error handler instead of crashing the process.
 *
 * Usage:
 *   router.get('/', asyncHandler(async (req, res) => { ... }));
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { asyncHandler };
