import { Router } from "express";
import multer from "multer";
import { requireAluno, requireSomenteAluno } from "../../middlewares/auth-aluno";
import { portalController } from "./portal.controller";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Área do aluno — montada ANTES de `requireAuth` em app.ts, com autenticação
// própria (`requireAluno`): token de usuário do sistema não vale aqui e vice-versa.
export const portalRouter = Router();

portalRouter.post("/login", portalController.login);

portalRouter.use(requireAluno);
portalRouter.get("/me", portalController.me);
portalRouter.get("/matriculas/:matriculaId/documentos", requireSomenteAluno, portalController.listarDocumentos);
portalRouter.post(
  "/matriculas/:matriculaId/documentos/:tipoId/arquivo",
  requireSomenteAluno,
  upload.single("arquivo"),
  portalController.enviarDocumento,
);
portalRouter.get("/documentos/:documentoId/arquivo", requireSomenteAluno, portalController.baixarDocumento);
portalRouter.get("/parcelas", portalController.listarParcelas);
portalRouter.get("/formas-pagamento", portalController.formasPagamento);
portalRouter.get("/pagamento", portalController.configuracaoPagamento);
portalRouter.post("/parcelas/:parcelaId/cartao", portalController.pagarComCartao);
portalRouter.post("/parcelas/:parcelaId/cobranca", portalController.gerarCobranca);
portalRouter.get("/tipos-solicitacao", requireSomenteAluno, portalController.listarTiposSolicitacao);
portalRouter.get("/solicitacoes", requireSomenteAluno, portalController.listarSolicitacoes);
portalRouter.post("/solicitacoes", requireSomenteAluno, portalController.solicitar);
portalRouter.get("/solicitacoes/:id/arquivo", requireSomenteAluno, portalController.baixarSolicitacao);
