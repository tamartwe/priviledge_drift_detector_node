import type { Request, Response } from "express";

/** Creates a minimal mock Express Request. */
export function mockRequest(opts: {
  body?: unknown;
  query?: Record<string, string>;
} = {}): Request {
  return {
    body: opts.body ?? {},
    query: opts.query ?? {},
  } as unknown as Request;
}

/** Creates a mock Express Response that captures status + json payload. */
export function mockResponse(): Response & {
  _status: number;
  _json: unknown;
} {
  const res = {
    _status: 200,
    _json: undefined as unknown,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._json = body;
      return this;
    },
  };
  return res as unknown as Response & { _status: number; _json: unknown };
}
