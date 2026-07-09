import { Router } from "express";
import { dashboardController } from "./dashboard.controller";

export const dashboardRouter = Router();

dashboardRouter.get("/geral", dashboardController.geral);
dashboardRouter.get("/cobranca", dashboardController.cobranca);
