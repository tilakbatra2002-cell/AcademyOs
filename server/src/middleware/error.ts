import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { isProd } from '../config/env';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found`, fields: {} },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Zod validation
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join('.') || '_'] = issue.message;
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields', fields },
    });
  }

  if (err instanceof ApiError) {
    if (err.status >= 500) logger.error(`${err.code}: ${err.message}`, err.details);
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, fields: err.fields ?? {} },
    });
  }

  // Mongoose validation
  if (err instanceof mongoose.Error.ValidationError) {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(err.errors)) fields[k] = v.message;
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', fields },
    });
  }

  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: `Invalid value for ${err.path}`, fields: { [err.path]: 'Invalid identifier' } },
    });
  }

  // Duplicate key
  const anyErr = err as { code?: number; keyValue?: Record<string, unknown>; message?: string; stack?: string };
  if (anyErr?.code === 11000) {
    const fields: Record<string, string> = {};
    for (const k of Object.keys(anyErr.keyValue || {})) fields[k] = 'Already exists';
    return res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: 'A record with these details already exists', fields },
    });
  }

  logger.error('Unhandled error', anyErr?.stack || anyErr?.message || err);
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isProd ? 'Something went wrong. Please try again.' : String(anyErr?.message || err),
      fields: {},
    },
  });
}
