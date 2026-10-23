import { Request, Response } from "express";
import { documentosLegadoLoteService } from "./documentos-legado-lote.service";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import { importacaoLegadoService } from "./importacao-legado.service";
import { documentosLegadoService } from "./documentos-legado.service";
import { importacaoLegadoLoteService } from "./importacao-legado-lote.service";
import { titulosLegadoLoteService } from "./titulos-legado-lote.service";
import { sincronizarTitulosDoAluno } from "./titulos-legado.service";
import { alunosRepository } from "../alunos/alunos.repository";
import { NotFoundError } from "../../shared/errors/app-error";
import { montarClient } from "../sincronizacao-legado/sincronizacao-legado.service";
import {
  buscarPorCpfSchema,
  confirmarImportacaoSchema,
  iniciarDocumentosLoteSchema,
  iniciarLoteSchema,
} from "./importacao-legado.schema";

export const importacaoLegadoController = {
  buscarPorCpf: asyncHandler(async (req: Request, res: Response) => {
    const input = buscarPorCpfSchema.parse(req.query);
    const resultado = await importacaoLegadoService.buscarPorCpf(input.cpf);
    res.json(resultado);
  }),

  confirmar: asyncHandler(async (req: Request, res: Response) => {
    const input = confirmarImportacaoSchema.parse(req.body);
    const resultado = await importacaoLegadoService.confirmarImportacao(input, usuarioAtual(req));
    res.status(201).json(resultado);
  }),

  /** Busca no legado os documentos do aluno e baixa os arquivos para a pasta de documentos. */
  importarDocumentos: asyncHandler(async (req: Request, res: Response) => {
    res.json(
      await documentosLegadoService.importarDoAluno(paramString(req, "alunoId"), usuarioAtual(req)),
    );
  }),

  /** Dispara a busca de TODOS os alunos do legado (roda em segundo plano no worker). */
  iniciarLote: asyncHandler(async (req: Request, res: Response) => {
    const { limite } = iniciarLoteSchema.parse(req.body ?? {});
    const lote = await importacaoLegadoLoteService.iniciar(usuarioAtual(req), limite);
    res.status(202).json(lote);
  }),

  /** Planilha com o relatório de ocorrências do lote (`atual` = o último). */
  relatorioLote: asyncHandler(async (req: Request, res: Response) => {
    const { arquivo, nome } = await importacaoLegadoLoteService.relatorio(
      paramString(req, "loteId"),
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
    res.send(arquivo);
  }),

  /** Consulta o legado e grava os títulos que faltam de UM aluno (parcela da matrícula ou título solto). */
  importarTitulosDoAluno: asyncHandler(async (req: Request, res: Response) => {
    const aluno = await alunosRepository.findById(paramString(req, "alunoId"));
    if (!aluno) throw new NotFoundError("Aluno não encontrado");
    res.json(await sincronizarTitulosDoAluno(aluno, await montarClient(), usuarioAtual(req)));
  }),

  /** Busca em lote dos títulos que faltam, de todos os alunos (roda em segundo plano). */
  iniciarTitulosLote: asyncHandler(async (req: Request, res: Response) => {
    res.status(202).json(await titulosLegadoLoteService.iniciar(usuarioAtual(req)));
  }),

  ultimoTitulosLote: asyncHandler(async (_req: Request, res: Response) => {
    res.json((await titulosLegadoLoteService.ultimo()) ?? null);
  }),

  /** Busca de documentos no legado para várias matrículas (roda em segundo plano). */
  iniciarDocumentosLote: asyncHandler(async (req: Request, res: Response) => {
    const { matriculaIds, filtros } = iniciarDocumentosLoteSchema.parse(req.body ?? {});
    const lote = await documentosLegadoLoteService.iniciar(usuarioAtual(req), {
      matriculaIds,
      filtros,
    });
    res.status(202).json(lote);
  }),

  ultimoDocumentosLote: asyncHandler(async (_req: Request, res: Response) => {
    res.json((await documentosLegadoLoteService.ultimo()) ?? null);
  }),

  cancelarDocumentosLote: asyncHandler(async (req: Request, res: Response) => {
    res.json(await documentosLegadoLoteService.cancelar(paramString(req, "loteId")));
  }),

  relatorioDocumentosLote: asyncHandler(async (req: Request, res: Response) => {
    const { arquivo, nome } = await documentosLegadoLoteService.relatorio(
      paramString(req, "loteId"),
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
    res.send(arquivo);
  }),

  /** Andamento do último lote (ou null se nunca rodou). */
  ultimoLote: asyncHandler(async (_req: Request, res: Response) => {
    res.json((await importacaoLegadoLoteService.ultimo()) ?? null);
  }),
};
