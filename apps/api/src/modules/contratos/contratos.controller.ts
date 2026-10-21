import { Request, Response } from "express";
import { ValidationError } from "../../shared/errors/app-error";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import { CAMPOS_CONTRATO } from "./contrato-modelo";
import { contratosService } from "./contratos.service";

export const contratosController = {
  campos: asyncHandler(async (_req: Request, res: Response) => {
    res.json(CAMPOS_CONTRATO);
  }),

  enviarModelo: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new ValidationError("Envie o arquivo .docx do modelo.");
    res.json(
      await contratosService.salvarModelo(
        req.file.buffer,
        req.file.originalname,
        usuarioAtual(req),
      ),
    );
  }),

  baixarModelo: asyncHandler(async (_req: Request, res: Response) => {
    const { caminho, nome } = await contratosService.baixarModelo();
    res.download(caminho, nome);
  }),

  obter: asyncHandler(async (req: Request, res: Response) => {
    res.json(await contratosService.obterDaMatricula(paramString(req, "matriculaId")));
  }),

  previa: asyncHandler(async (req: Request, res: Response) => {
    const { arquivo, nome, naoEncontrados } = await contratosService.gerarPrevia(
      paramString(req, "matriculaId"),
    );
    // Campos do modelo que o sistema não conhece vão no header, para a tela avisar.
    res.setHeader("X-Campos-Desconhecidos", encodeURIComponent(naoEncontrados.join(",")));
    res.setHeader("Access-Control-Expose-Headers", "X-Campos-Desconhecidos");
    res.type("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
    );
    res.send(arquivo);
  }),

  enviar: asyncHandler(async (req: Request, res: Response) => {
    res
      .status(201)
      .json(await contratosService.enviar(paramString(req, "matriculaId"), usuarioAtual(req)));
  }),

  cancelar: asyncHandler(async (req: Request, res: Response) => {
    await contratosService.cancelar(paramString(req, "matriculaId"), usuarioAtual(req));
    res.status(204).end();
  }),

  sincronizar: asyncHandler(async (req: Request, res: Response) => {
    res.json(await contratosService.sincronizarDaMatricula(paramString(req, "matriculaId")));
  }),

  arquivo: asyncHandler(async (req: Request, res: Response) => {
    const tipo = req.query.tipo === "assinado" ? "assinado" : "gerado";
    const { caminho, nome, mime } = await contratosService.arquivo(
      paramString(req, "matriculaId"),
      tipo,
    );
    res.type(mime);
    if (req.query.inline === "1") {
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(nome)}`);
      res.sendFile(caminho);
      return;
    }
    res.download(caminho, nome);
  }),

  // Rota pública (ver app.ts): quem chama é a Clicksign. A autenticidade vem do HMAC no header
  // `Content-Hmac`, calculado sobre o corpo bruto. Sempre 2xx para eventos válidos.
  webhook: asyncHandler(async (req: Request, res: Response) => {
    const bruto = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from("");
    await contratosService.processarWebhook(bruto, req.header("content-hmac"), req.body);
    res.status(200).json({ recebido: true });
  }),
};
