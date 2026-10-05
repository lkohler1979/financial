import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import {
  atualizarDocumentoSchema,
  atualizarTipoDocumentoSchema,
  criarTipoDocumentoSchema,
} from "./documentos.schema";
import { documentosService } from "./documentos.service";

export const documentosController = {
  listarTipos: asyncHandler(async (req: Request, res: Response) => {
    res.json(await documentosService.listarTipos(req.query.incluirInativos === "true"));
  }),

  criarTipo: asyncHandler(async (req: Request, res: Response) => {
    const input = criarTipoDocumentoSchema.parse(req.body);
    res.status(201).json(await documentosService.criarTipo(input, usuarioAtual(req)));
  }),

  atualizarTipo: asyncHandler(async (req: Request, res: Response) => {
    const input = atualizarTipoDocumentoSchema.parse(req.body);
    res.json(await documentosService.atualizarTipo(paramString(req, "id"), input, usuarioAtual(req)));
  }),

  aguardandoConferencia: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await documentosService.listarAguardandoConferencia());
  }),

  listarDaMatricula: asyncHandler(async (req: Request, res: Response) => {
    res.json(
      await documentosService.listarDaMatricula(paramString(req, "matriculaId"), usuarioAtual(req)),
    );
  }),

  anexarArquivo: asyncHandler(async (req: Request, res: Response) => {
    const documento = await documentosService.anexarArquivo(
      paramString(req, "matriculaId"),
      paramString(req, "tipoId"),
      req.file,
      usuarioAtual(req),
    );
    res.status(201).json(documento);
  }),

  atualizar: asyncHandler(async (req: Request, res: Response) => {
    const input = atualizarDocumentoSchema.parse(req.body);
    const documento = await documentosService.atualizar(
      paramString(req, "matriculaId"),
      paramString(req, "tipoId"),
      input,
      usuarioAtual(req),
    );
    res.json(documento);
  }),

  removerArquivo: asyncHandler(async (req: Request, res: Response) => {
    res.json(
      await documentosService.removerArquivo(paramString(req, "documentoId"), usuarioAtual(req)),
    );
  }),

  baixarArquivo: asyncHandler(async (req: Request, res: Response) => {
    const arquivo = await documentosService.obterArquivo(paramString(req, "documentoId"));
    res.type(arquivo.mime);
    res.download(arquivo.caminho, arquivo.nome);
  }),
};
