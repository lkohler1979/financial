import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import {
  adicionarTagSchema,
  aplicarLoteSchema,
  criarObservacaoSchema,
  mudarSituacaoParcelaSchema,
  mudarSituacaoSchema,
} from "./ficha.schema";
import { fichaService } from "./ficha.service";
import { renegociarSchema } from "./renegociacao.schema";
import { renegociacaoService } from "./renegociacao.service";

export const fichaController = {
  obterFicha: asyncHandler(async (req: Request, res: Response) => {
    const ficha = await fichaService.obterFicha(paramString(req, "matriculaId"));
    res.json(ficha);
  }),

  mudarSituacao: asyncHandler(async (req: Request, res: Response) => {
    const input = mudarSituacaoSchema.parse(req.body);
    const matricula = await fichaService.mudarSituacao(
      paramString(req, "matriculaId"),
      input.situacaoCobrancaId,
      usuarioAtual(req),
    );
    res.json(matricula);
  }),

  mudarSituacaoParcela: asyncHandler(async (req: Request, res: Response) => {
    const input = mudarSituacaoParcelaSchema.parse(req.body);
    const parcela = await fichaService.mudarSituacaoParcela(
      paramString(req, "matriculaId"),
      paramString(req, "parcelaId"),
      input.situacaoCobrancaId,
      usuarioAtual(req),
    );
    res.json(parcela);
  }),

  simularRenegociacao: asyncHandler(async (req: Request, res: Response) => {
    const input = renegociarSchema.parse(req.body);
    res.json(await renegociacaoService.simular(paramString(req, "matriculaId"), input));
  }),

  renegociar: asyncHandler(async (req: Request, res: Response) => {
    const input = renegociarSchema.parse(req.body);
    const renegociacao = await renegociacaoService.renegociar(
      paramString(req, "matriculaId"),
      input,
      usuarioAtual(req),
    );
    res.status(201).json(renegociacao);
  }),

  adicionarTag: asyncHandler(async (req: Request, res: Response) => {
    const input = adicionarTagSchema.parse(req.body);
    await fichaService.adicionarTag(
      paramString(req, "matriculaId"),
      input.tagId,
      usuarioAtual(req),
    );
    res.status(204).send();
  }),

  removerTag: asyncHandler(async (req: Request, res: Response) => {
    await fichaService.removerTag(
      paramString(req, "matriculaId"),
      paramString(req, "tagId"),
      usuarioAtual(req),
    );
    res.status(204).send();
  }),

  adicionarObservacao: asyncHandler(async (req: Request, res: Response) => {
    const input = criarObservacaoSchema.parse(req.body);
    const observacao = await fichaService.adicionarObservacao(
      paramString(req, "matriculaId"),
      input.texto,
      usuarioAtual(req),
    );
    res.status(201).json(observacao);
  }),

  aplicarLote: asyncHandler(async (req: Request, res: Response) => {
    const input = aplicarLoteSchema.parse(req.body);
    const resultado = await fichaService.aplicarEmLote(input, usuarioAtual(req));
    res.json(resultado);
  }),
};
