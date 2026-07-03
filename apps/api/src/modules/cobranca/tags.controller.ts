import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString } from "../../shared/utils/http";
import { criarTagSchema } from "./tags.schema";
import { tagsService } from "./tags.service";

export const tagsController = {
  listar: asyncHandler(async (_req: Request, res: Response) => {
    const tags = await tagsService.listar();
    res.json(tags);
  }),

  criar: asyncHandler(async (req: Request, res: Response) => {
    const input = criarTagSchema.parse(req.body);
    const tag = await tagsService.criar(input);
    res.status(201).json(tag);
  }),

  remover: asyncHandler(async (req: Request, res: Response) => {
    await tagsService.remover(paramString(req, "id"));
    res.status(204).send();
  }),
};
