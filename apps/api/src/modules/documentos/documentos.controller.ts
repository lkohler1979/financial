import fs from "node:fs";
import JSZip from "jszip";
import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import {
  atualizarDocumentoSchema,
  atualizarTipoDocumentoSchema,
  criarTipoDocumentoSchema,
  downloadLoteSchema,
  listarDocumentosSchema,
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
    res.json(
      await documentosService.atualizarTipo(paramString(req, "id"), input, usuarioAtual(req)),
    );
  }),

  listar: asyncHandler(async (req: Request, res: Response) => {
    res.json(await documentosService.listar(listarDocumentosSchema.parse(req.query)));
  }),

  /** ZIP com os arquivos escolhidos (ids) ou todos os que casam com os filtros da consulta. */
  baixarLote: asyncHandler(async (req: Request, res: Response) => {
    const { arquivos, ausentes } = await documentosService.prepararLote(
      downloadLoteSchema.parse(req.body),
    );
    const zip = new JSZip();
    for (const a of arquivos) zip.file(a.nomeNoZip, fs.createReadStream(a.caminho));
    if (ausentes.length) {
      zip.file(
        "_arquivos-nao-encontrados.txt",
        [
          "Estes arquivos constam no sistema mas não estavam no servidor:",
          "",
          ...ausentes,
          "",
        ].join("\n"),
      );
    }
    const data = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="documentos-${data}.zip"`);
    res.setHeader("X-Documentos-Ausentes", String(ausentes.length));
    res.setHeader("Access-Control-Expose-Headers", "X-Documentos-Ausentes");
    // Em fluxo: o ZIP vai saindo enquanto é montado, sem carregar tudo na memória.
    zip
      .generateNodeStream({ streamFiles: true, compression: "DEFLATE" })
      .on("error", () => res.destroy())
      .pipe(res);
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
      req.ip,
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
    // ?inline=1 abre no próprio navegador (visualização); sem isso baixa o arquivo.
    if (req.query.inline === "1") {
      res.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(arquivo.nome)}`,
      );
      res.sendFile(arquivo.caminho);
      return;
    }
    res.download(arquivo.caminho, arquivo.nome);
  }),
};
