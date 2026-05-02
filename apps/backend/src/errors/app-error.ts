/**
 * app-error.ts — Application error hierarchy.
 *
 * All application errors extend AppError. The global error middleware
 * (error.middleware.ts) inspects the error type and serializes accordingly.
 *
 * Design principles:
 *   1. Every error has a machine-readable `code` string (for clients to match on)
 *   2. Every error has a human-readable `message` (for UI display or logging)
 *   3. Validation errors carry field-level `details` (for form error display)
 *   4. Stack traces are captured but NEVER sent to clients in production
 *   5. Operational errors (expected) are distinguished from programmer errors (bugs)
 *
 * Error code format: SCREAMING_SNAKE_CASE
 * Examples: VALIDATION_ERROR, UNAUTHORIZED, SHIPMENT_NOT_FOUND, PAYMENT_FAILED
 */

import type { ZodError } from 'zod';

// ─── Base class ───────────────────────────────────────────────────────────────

export interface AppErrorOptions {
  /** HTTP status code. Defaults vary by subclass. */
  statusCode?: number;
  /** Machine-readable error code for client-side matching. */
  code?: string;
  /** Whether this is an expected (operational) error vs a programming bug. */
  isOperational?: boolean;
  /** Structured validation details for field-level errors. */
  details?: ValidationDetail[];
}

export interface ValidationDetail {
  field: string;
  message: string;
  received?: unknown;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly isOperational: boolean;
  readonly details: ValidationDetail[];

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);

    this.name        = this.constructor.name;
    this.statusCode  = options.statusCode  ?? 500;
    this.code        = options.code        ?? 'INTERNAL_ERROR';
    this.isOperational = options.isOperational ?? true;
    this.details     = options.details     ?? [];

    // Captures proper stack trace in V8 (Node.js), excluding the constructor frame
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serialize to a JSON-safe object for API responses.
   * Stack trace is NEVER included in production serialization.
   */
  toJSON(includeStack = false): Record<string, unknown> {
    const base: Record<string, unknown> = {
      error:   this.code,
      message: this.message,
    };

    if (this.details.length > 0) {
      base['details'] = this.details;
    }

    if (includeStack && this.stack) {
      base['stack'] = this.stack;
    }

    return base;
  }
}

/**
 * Formats a ZodError into a structured ValidationDetail array.
 * Used by error middleware and manual validation blocks.
 */
export function formatZodError(err: ZodError): ValidationDetail[] {
  return err.issues.map((issue) => ({
    field:   issue.path.join('.') || '_root',
    message: issue.message,
  }));
}

// ─── 400 Bad Request ──────────────────────────────────────────────────────────

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details: ValidationDetail[] = []) {
    super(message, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      isOperational: true,
      details,
    });
  }
}

// ─── 401 Unauthorized ────────────────────────────────────────────────────────
// Authentication failed — identity not established.

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, {
      statusCode: 401,
      code: 'UNAUTHORIZED',
      isOperational: true,
    });
  }
}

// ─── 402 Payment Required ────────────────────────────────────────────────────

export class PaymentRequiredError extends AppError {
  constructor(message = 'Payment is required to proceed') {
    super(message, {
      statusCode: 402,
      code: 'PAYMENT_REQUIRED',
      isOperational: true,
    });
  }
}

// ─── 403 Forbidden ───────────────────────────────────────────────────────────
// Authentication succeeded but authorization failed — wrong role.

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, {
      statusCode: 403,
      code: 'FORBIDDEN',
      isOperational: true,
    });
  }
}

// ─── 404 Not Found ───────────────────────────────────────────────────────────

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, {
      statusCode: 404,
      code: 'NOT_FOUND',
      isOperational: true,
    });
  }
}

// ─── 409 Conflict ────────────────────────────────────────────────────────────
// Optimistic concurrency failure (ADR-005) or duplicate idempotency key.

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict — please reload and retry') {
    super(message, {
      statusCode: 409,
      code: 'CONFLICT',
      isOperational: true,
    });
  }
}

// ─── 410 Gone ────────────────────────────────────────────────────────────────
// Payment expired.

export class GoneError extends AppError {
  constructor(message = 'This resource has expired') {
    super(message, {
      statusCode: 410,
      code: 'GONE',
      isOperational: true,
    });
  }
}

// ─── 422 Unprocessable Entity ────────────────────────────────────────────────
// Syntactically valid input that fails business rule validation.
// Example: weight > 10kg, unsupported city, invalid state transition.

export class BusinessRuleError extends AppError {
  constructor(message: string, code = 'BUSINESS_RULE_VIOLATION') {
    super(message, {
      statusCode: 422,
      code,
      isOperational: true,
    });
  }
}

// ─── 429 Too Many Requests ───────────────────────────────────────────────────

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests — please slow down') {
    super(message, {
      statusCode: 429,
      code: 'RATE_LIMITED',
      isOperational: true,
    });
  }
}

// ─── 500 Internal Server Error ───────────────────────────────────────────────
// Unexpected errors — programming bugs, infrastructure failures.
// isOperational = false: Sentry captures these at error severity.

export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred') {
    super(message, {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      isOperational: false,
    });
  }
}

// ─── 502 Bad Gateway ─────────────────────────────────────────────────────────
// External service failure (Paychangu down, Firebase unreachable, etc.)

export class ExternalServiceError extends AppError {
  constructor(service: string, message?: string) {
    super(message ?? `External service unavailable: ${service}`, {
      statusCode: 502,
      code: 'EXTERNAL_SERVICE_ERROR',
      isOperational: true,
    });
  }
}

// ─── Supabase error mapper ────────────────────────────────────────────────────
// Maps Supabase/PostgreSQL error codes to AppError subclasses.
// Used in service layer to normalize DB errors into API errors.

interface SupabaseError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export function mapSupabaseError(err: SupabaseError): AppError {
  const code    = err.code    ?? '';
  const message = err.message ?? 'Database error';

  // PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
  switch (true) {
    // No rows returned by .single()
    case code === 'PGRST116':
      return new NotFoundError('Resource');

    // Unique constraint violation
    case code === '23505':
      return new ConflictError('A record with this data already exists');

    // Foreign key violation
    case code === '23503':
      return new BusinessRuleError('Referenced resource does not exist');

    // Check constraint violation (weight, city, etc.)
    case code === '23514':
      return new BusinessRuleError(`Data violates a business constraint: ${message}`);

    // RLS policy violation — user tried to access another user's data
    case code === '42501':
      return new AuthorizationError('Access denied by data security policy');

    // Row lock conflict (optimistic concurrency — ADR-005)
    case message.includes('CONFLICT'):
      return new ConflictError('Record modified concurrently — reload and retry');

    // State machine violation
    case message.includes('INVALID_TRANSITION'):
      return new BusinessRuleError(message, 'INVALID_STATE_TRANSITION');

    // Not found from RPC
    case message.includes('NOT_FOUND'):
      return new NotFoundError('Resource');

    // Forbidden from RPC
    case message.includes('FORBIDDEN'):
      return new AuthorizationError('You do not have permission for this action');

    // Unauthorized from RPC
    case message.includes('UNAUTHORIZED'):
      return new AuthenticationError('Authentication required');

    default:
      return new InternalError(`Unexpected database error: ${message}`);
  }
}
