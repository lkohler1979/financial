import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { loginSchema } from "./auth.schema";
import { authService } from "./auth.service";

export const authController = {
  login: asyncHandler(async (req: Request, res: Response) => {
    const input = loginSchema.parse(req.body);
    const resultado = await authService.login(input);
    res.json(resultado);
  }),
};
