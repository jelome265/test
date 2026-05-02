/**
 * async-handler.ts — Express async route wrapper.
 *
 * Problem: Express does not natively handle Promise rejections from async
 * route handlers. An unhandled rejection in an async route causes the
 * process to crash (Node 15+) or silently hang the request (Node < 15).
 *
 * Solution: Wrap every async handler in this function. It catches
 * rejected promises and forwards them to Express's next(err) mechanism,
 * which routes them to the global error handler.
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => {
 *     const data = await someAsyncOperation();
 *     res.json(data);
 *   }));
 *
 * Never write: router.get('/path', async (req, res, next) => { ... })
 * Always write: router.get('/path', asyncHandler(async (req, res) => { ... }))
 *
 * The distinction matters: the first form requires you to manually wrap in
 * try/catch and call next(err). The second is automatic.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Wraps an async Express route handler to forward rejected promises to next().
 */
export function asyncHandler(fn: AsyncRouteHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
