/**
 * request-id.middleware.ts — Attaches a unique request ID to every request.
 *
 * Priority:
 *   1. X-Request-ID header from caller (propagated from upstream proxy or mobile client)
 *   2. Generated UUID v4 if header is absent
 *
 * The ID is echoed back in the response header so the mobile client can
 * correlate a failed request with the backend log entry.
 */

import { randomUUID }            from 'crypto';
import type { NextFunction, Request, Response } from 'express';

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.headers['x-request-id'];
  const id = Array.isArray(existingId)
    ? (existingId[0] ?? randomUUID())
    : (existingId ?? randomUUID());

  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}
