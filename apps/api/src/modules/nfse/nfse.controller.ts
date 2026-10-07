import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import { nfseNacionalService } from "./nacional/nfse-nacional.service";
import {
  buscaPagamentosSchema,
  certificadoSchema,
  consultaNfseSchema,
  emitirIndividualSchema,
  emitirNfseSchema,
} from "./nfse.schema";
import { mesAnterior, nfseService } from "./nfse.service";

/** "AAAA-MM-DD" → data local à meia-noite (início do dia). */
const dataLocal = (iso: string) => new Date(`${iso}T00:00:00`);

export const nfseController = {
  previa: asyncHandler(async (req: Request, res: Response) => {
    const { mes } = consultaNfseSchema.parse(req.query);
    res.json(await nfseService.previa(mes));
  }),

  /** Emissão manual: não depende da janela nem do interruptor da emissão automática. */
  emitir: asyncHandler(async (req: Request, res: Response) => {
    const { mes } = emitirNfseSchema.parse(req.body ?? {});
    const resultado = await nfseService.emitirPendentes(mes ?? mesAnterior(new Date()), usuarioAtual(req));
    res.json(resultado);
  }),

  atualizarStatus: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await nfseService.atualizarStatus());
  }),

  reemitirParcela: asyncHandler(async (req: Request, res: Response) => {
    res.json(await nfseService.reemitirParcela(paramString(req, "parcelaId"), usuarioAtual(req)));
  }),

  /** Pagamentos realizados que podem receber uma nota individual. */
  buscarPagamentos: asyncHandler(async (req: Request, res: Response) => {
    const { busca, de, ate } = buscaPagamentosSchema.parse(req.query);
    const fim = ate ? dataLocal(ate) : undefined;
    fim?.setDate(fim.getDate() + 1);
    res.json(await nfseService.buscarPagamentos({ busca, inicio: de ? dataLocal(de) : undefined, fim }));
  }),

  /** Emite a nota de UM pagamento (qualquer parcela paga), com competência opcional. */
  emitirIndividual: asyncHandler(async (req: Request, res: Response) => {
    const { competencia } = emitirIndividualSchema.parse(req.body ?? {});
    res.json(await nfseService.emitirParaParcela(paramString(req, "parcelaId"), usuarioAtual(req), { competencia }));
  }),

  /** PDF (DANFSe) de uma nota emitida direto na SEFIN Nacional. */
  danfse: asyncHandler(async (req: Request, res: Response) => {
    const { pdf, nomeArquivo } = await nfseNacionalService.baixarDanfse(paramString(req, "parcelaId"));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${nomeArquivo}"`);
    res.send(pdf);
  }),

  situacaoNacional: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await nfseNacionalService.situacao());
  }),

  salvarCertificado: asyncHandler(async (req: Request, res: Response) => {
    const { pfxBase64, senha } = certificadoSchema.parse(req.body);
    res.json(await nfseNacionalService.salvarCertificado(pfxBase64, senha, usuarioAtual(req)));
  }),

  removerCertificado: asyncHandler(async (req: Request, res: Response) => {
    await nfseNacionalService.removerCertificado(usuarioAtual(req));
    res.status(204).end();
  }),

  testarConexao: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await nfseNacionalService.testarConexao());
  }),
};
