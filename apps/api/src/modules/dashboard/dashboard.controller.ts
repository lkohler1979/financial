import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { dashboardService } from "./dashboard.service";

export const dashboardController = {
  geral: asyncHandler(async (_req: Request, res: Response) => {
    const dashboard = await dashboardService.geral();
    res.json(dashboard);
  }),

  cobranca: asyncHandler(async (_req: Request, res: Response) => {
    const dashboard = await dashboardService.cobranca();
    res.json(dashboard);
  }),
};
