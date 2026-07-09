import { Request, Response } from "express";
import path from "node:path";
import fs from "node:fs";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import { AppError, NotFoundError } from "../../shared/errors/app-error";
import {
  filtrosElegibilidadeSchema,
  gerarRelatorioSchema,
  listarRelatoriosSchema,
} from "./relatorios.schema";
import { relatoriosService } from "./relatorios.service";

interface ItemRelatorio {
  matriculaId: string;
  alunoNome: string;
  documentoGerado?: boolean;
  caminhoDocumento?: string | null;
  caminhoDocumentoPdf?: string | null;
}

export const relatoriosController = {
  previaElegiveis: asyncHandler(async (req: Request, res: Response) => {
    const filtros = filtrosElegibilidadeSchema.parse(req.query);
    const elegiveis = await relatoriosService.previaElegiveis(filtros);
    res.json({ data: elegiveis, total: elegiveis.length });
  }),

  gerar: asyncHandler(async (req: Request, res: Response) => {
    const input = gerarRelatorioSchema.parse(req.body);
    const relatorio = await relatoriosService.gerar(input, usuarioAtual(req));
    res.status(202).json(relatorio);
  }),

  statusJob: asyncHandler(async (req: Request, res: Response) => {
    const status = await relatoriosService.statusJob(paramString(req, "jobId"));
    res.json(status);
  }),

  listar: asyncHandler(async (req: Request, res: Response) => {
    const params = listarRelatoriosSchema.parse(req.query);
    const resultado = await relatoriosService.listar(params);
    res.json(resultado);
  }),

  buscarPorId: asyncHandler(async (req: Request, res: Response) => {
    const relatorio = await relatoriosService.buscarPorId(paramString(req, "id"));
    res.json(relatorio);
  }),

  buscarUltimoDocumentoDaMatricula: asyncHandler(async (req: Request, res: Response) => {
    const resultado = await relatoriosService.buscarUltimoDocumentoGeradoPorMatricula(
      paramString(req, "matriculaId"),
    );
    if (!resultado) {
      throw new NotFoundError("Nenhum documento foi gerado para esta matrícula ainda");
    }
    res.json(resultado);
  }),

  baixarDocumento: asyncHandler(async (req: Request, res: Response) => {
    const relatorio = await relatoriosService.buscarPorId(paramString(req, "id"));
    const matriculaId = paramString(req, "matriculaId");
    const formato = req.query.formato === "pdf" ? "pdf" : "docx";

    const itens = Array.isArray(relatorio.itens)
      ? (relatorio.itens as unknown as ItemRelatorio[])
      : [];
    const item = itens.find((i) => i.matriculaId === matriculaId);

    if (!item || !item.documentoGerado || !item.caminhoDocumento) {
      throw new NotFoundError("Documento não encontrado para esta matrícula neste relatório");
    }

    // O PDF é gerado junto com o .docx no momento da geração (ver
    // geracao-word.worker.ts) — sem conversão sob demanda. Relatórios
    // gerados antes desta mudança não têm `caminhoDocumentoPdf` salvo.
    const caminhoRelativo = formato === "pdf" ? item.caminhoDocumentoPdf : item.caminhoDocumento;
    if (!caminhoRelativo) {
      throw new NotFoundError(
        formato === "pdf"
          ? "PDF não disponível para este documento (gerado antes do suporte a PDF)"
          : "Documento não encontrado para esta matrícula neste relatório",
      );
    }

    const caminhoAbsoluto = path.resolve(caminhoRelativo);
    if (!fs.existsSync(caminhoAbsoluto)) {
      throw new AppError(
        "Documento não está mais disponível em disco",
        410,
        "DOCUMENTO_INDISPONIVEL",
      );
    }

    res.download(caminhoAbsoluto, path.basename(caminhoAbsoluto));
  }),

  excluir: asyncHandler(async (req: Request, res: Response) => {
    await relatoriosService.excluir(paramString(req, "id"), usuarioAtual(req));
    res.status(204).send();
  }),
};
