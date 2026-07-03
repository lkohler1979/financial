import { Router } from "express";
import { tagsController } from "./tags.controller";

export const tagsRouter = Router();

tagsRouter.get("/", tagsController.listar);
tagsRouter.post("/", tagsController.criar);
tagsRouter.delete("/:id", tagsController.remover);
