import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString } from "../../shared/utils/http";
import {
  gerarCobrancaAlunoSchema,
  loginAlunoSchema,
  solicitarDocumentoSchema,
} from "./portal.schema";
import { portalService } from "./portal.service";

const alunoAtual = (req: Request) => req.alunoId as string;

export const portalController = {
  login: asyncHandler(async (req: Request, res: Response) => {
    const input = loginAlunoSchema.parse(req.body);
    res.json(await portalService.login(input, req.ip ?? "desconhecido"));
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    res.json(await portalService.me(alunoAtual(req)));
  }),

  listarDocumentos: asyncHandler(async (req: Request, res: Response) => {
    res.json(await portalService.listarDocumentos(alunoAtual(req), paramString(req, "matriculaId")));
  }),

  enviarDocumento: asyncHandler(async (req: Request, res: Response) => {
    res
      .status(201)
      .json(
        await portalService.enviarDocumento(
          alunoAtual(req),
          paramString(req, "matriculaId"),
          paramString(req, "tipoId"),
          req.file,
          req.ip,
        ),
      );
  }),

  baixarDocumento: asyncHandler(async (req: Request, res: Response) => {
    const arquivo = await portalService.baixarDocumento(alunoAtual(req), paramString(req, "documentoId"));
    res.type(arquivo.mime);
    res.download(arquivo.caminho, arquivo.nome);
  }),

  listarParcelas: asyncHandler(async (req: Request, res: Response) => {
    res.json(await portalService.listarParcelas(alunoAtual(req)));
  }),

  formasPagamento: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await portalService.formasPagamento());
  }),

  gerarCobranca: asyncHandler(async (req: Request, res: Response) => {
    const { formaPagamento } = gerarCobrancaAlunoSchema.parse(req.body ?? {});
    res.json(
      await portalService.gerarCobranca(alunoAtual(req), paramString(req, "parcelaId"), formaPagamento),
    );
  }),

  listarTiposSolicitacao: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await portalService.listarTiposSolicitacao());
  }),

  listarSolicitacoes: asyncHandler(async (req: Request, res: Response) => {
    res.json(await portalService.listarSolicitacoes(alunoAtual(req)));
  }),

  solicitar: asyncHandler(async (req: Request, res: Response) => {
    const input = solicitarDocumentoSchema.parse(req.body);
    res.status(201).json(await portalService.solicitar(alunoAtual(req), input));
  }),

  baixarSolicitacao: asyncHandler(async (req: Request, res: Response) => {
    const arquivo = await portalService.baixarSolicitacao(alunoAtual(req), paramString(req, "id"));
    res.type(arquivo.mime);
    res.download(arquivo.caminho, arquivo.nome);
  }),
};
