import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import {
  alterarSenhaSchema,
  atualizarUsuarioSchema,
  criarUsuarioSchema,
  listarUsuariosSchema,
} from "./usuarios.schema";
import { usuariosService } from "./usuarios.service";

export const usuariosController = {
  listar: asyncHandler(async (req: Request, res: Response) => {
    const params = listarUsuariosSchema.parse(req.query);
    const resultado = await usuariosService.listar(params);
    res.json(resultado);
  }),

  buscarPorId: asyncHandler(async (req: Request, res: Response) => {
    const usuario = await usuariosService.buscarPorId(paramString(req, "id"));
    res.json(usuario);
  }),

  criar: asyncHandler(async (req: Request, res: Response) => {
    const input = criarUsuarioSchema.parse(req.body);
    const usuario = await usuariosService.criar(input, usuarioAtual(req));
    res.status(201).json(usuario);
  }),

  atualizar: asyncHandler(async (req: Request, res: Response) => {
    const input = atualizarUsuarioSchema.parse(req.body);
    const usuario = await usuariosService.atualizar(paramString(req, "id"), input, usuarioAtual(req));
    res.json(usuario);
  }),

  alterarSenha: asyncHandler(async (req: Request, res: Response) => {
    const input = alterarSenhaSchema.parse(req.body);
    await usuariosService.alterarSenha(paramString(req, "id"), input, usuarioAtual(req));
    res.status(204).send();
  }),
};
