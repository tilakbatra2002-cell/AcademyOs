export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'PLAN_LIMIT_EXCEEDED'
  | 'SUBSCRIPTION_INACTIVE'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'INTERNAL_ERROR';

const statusByCode: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  PLAN_LIMIT_EXCEEDED: 403,
  SUBSCRIPTION_INACTIVE: 402,
  PROVIDER_NOT_CONFIGURED: 501,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly fields?: Record<string, string>;
  public readonly details?: unknown;

  constructor(code: ErrorCode, message: string, fields?: Record<string, string>, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = statusByCode[code];
    this.fields = fields;
    this.details = details;
  }

  static badRequest(m = 'Bad request', f?: Record<string, string>) { return new ApiError('BAD_REQUEST', m, f); }
  static unauthenticated(m = 'Authentication required') { return new ApiError('UNAUTHENTICATED', m); }
  static invalidCredentials(m = 'Invalid email or password') { return new ApiError('INVALID_CREDENTIALS', m); }
  static forbidden(m = 'You do not have permission to perform this action') { return new ApiError('FORBIDDEN', m); }
  static notFound(m = 'Resource not found') { return new ApiError('NOT_FOUND', m); }
  static conflict(m = 'Resource conflict', f?: Record<string, string>) { return new ApiError('CONFLICT', m, f); }
  static validation(m = 'Validation failed', f?: Record<string, string>) { return new ApiError('VALIDATION_ERROR', m, f); }
  static planLimit(m = 'Subscription plan limit exceeded') { return new ApiError('PLAN_LIMIT_EXCEEDED', m); }
  static internal(m = 'Something went wrong') { return new ApiError('INTERNAL_ERROR', m); }
}
