import { NextFunction, Request, RequestHandler, Response } from "express";

// Envolve controladores assíncronos para encaminhar rejeições ao error-handler
// central, independentemente da versão do Express.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
