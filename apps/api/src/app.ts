import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { requireAuth, requireRole } from "./middlewares/auth";
import { auditoriaRequestContext } from "./middlewares/auditoria-request";
import { errorHandler } from "./middlewares/error-handler";
import { authRouter } from "./modules/auth/auth.routes";
import { usuariosRouter } from "./modules/usuarios/usuarios.routes";
import { alunosRouter } from "./modules/alunos/alunos.routes";
import { cursosRouter } from "./modules/cursos/cursos.routes";
import { matriculasRouter } from "./modules/matriculas/matriculas.routes";
import { financeiroRouter } from "./modules/financeiro/financeiro.routes";
import { importacaoRouter } from "./modules/importacao/importacao.routes";
import { mapeamentoImportacaoRouter } from "./modules/mapeamento-importacao/mapeamento-importacao.routes";
import { relatoriosRouter } from "./modules/relatorios/relatorios.routes";
import { cobrancaRouter } from "./modules/cobranca/cobranca.routes";
import { sincronizacaoLegadoRouter } from "./modules/sincronizacao-legado/sincronizacao-legado.routes";
import { importacaoLegadoRouter } from "./modules/importacao-legado/importacao-legado.routes";
import { asaasRouter, asaasWebhookRouter } from "./modules/asaas/asaas.routes";
import { redeWebhookRouter } from "./modules/rede/rede.routes";
import { configuracoesRouter } from "./modules/configuracoes/configuracoes.routes";
import { auditoriaRouter } from "./modules/auditoria/auditoria.routes";
import { cuponsRouter } from "./modules/cupons/cupons.routes";
import { tiposCobrancaRouter } from "./modules/tipos-cobranca/tipos-cobranca.routes";
import { documentosRouter } from "./modules/documentos/documentos.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Alguns proxies reversos na frente da API (ex.: Traefik/EasyPanel) removem o
// prefixo público "/api" antes de repassar a requisição pro container. Em
// dev/docker-compose, sem proxy no meio, o prefixo chega intacto. Recolocamos
// o prefixo quando ele já não estiver presente, pra funcionar nos dois casos.
app.use((req, _res, next) => {
  if (req.url !== "/api" && !req.url.startsWith("/api/")) {
    req.url = `/api${req.url}`;
  }
  next();
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "ethos-financial-api" });
});

// Login é a única rota de negócio pública — todo o resto exige JWT (Sprint 7).
app.use("/api/auth", authRouter);
// Webhook do Asaas também é público — autenticado pelo token configurado em
// Configurações (header `asaas-access-token`), não por JWT (quem chama é o
// Asaas, não um usuário logado).
app.use("/api/asaas/webhook", asaasWebhookRouter);
// Webhook da Rede (Pix) — mesma lógica, público, autenticado pelo token
// configurado em Configurações (header `authorization`).
app.use("/api/rede/webhook", redeWebhookRouter);

app.use("/api", requireAuth);
app.use("/api", auditoriaRequestContext);

// RBAC por módulo (docs/PENDENCIAS.md tem a matriz de perfis x módulos):
// ADMINISTRADOR tem acesso irrestrito; FINANCEIRO cobre cursos, alunos,
// matrículas, financeiro, importação e relatórios; USUARIO cobre só alunos,
// matrículas e relatórios. `cobranca` tem RBAC fino dentro do próprio módulo
// (leitura de situações/tags liberada para todos, resto só ADMINISTRADOR).
app.use("/api/usuarios", requireRole("ADMINISTRADOR"), usuariosRouter);
app.use("/api/dashboard", requireRole("ADMINISTRADOR"), dashboardRouter);
app.use("/api/alunos", requireRole("ADMINISTRADOR", "FINANCEIRO", "USUARIO"), alunosRouter);
app.use("/api/cursos", requireRole("ADMINISTRADOR", "FINANCEIRO"), cursosRouter);
app.use("/api/matriculas", requireRole("ADMINISTRADOR", "FINANCEIRO", "USUARIO"), matriculasRouter);
app.use("/api/cupons", requireRole("ADMINISTRADOR", "FINANCEIRO", "USUARIO"), cuponsRouter);
app.use("/api/tipos-cobranca", requireRole("ADMINISTRADOR", "FINANCEIRO", "USUARIO"), tiposCobrancaRouter);
app.use("/api/documentos", requireRole("ADMINISTRADOR", "FINANCEIRO", "USUARIO"), documentosRouter);
app.use("/api/financeiro", requireRole("ADMINISTRADOR", "FINANCEIRO"), financeiroRouter);
app.use("/api/importacao", requireRole("ADMINISTRADOR", "FINANCEIRO"), importacaoRouter);
app.use(
  "/api/mapeamentos-importacao",
  requireRole("ADMINISTRADOR", "FINANCEIRO"),
  mapeamentoImportacaoRouter,
);
app.use("/api/relatorios", requireRole("ADMINISTRADOR", "FINANCEIRO", "USUARIO"), relatoriosRouter);
app.use("/api/cobranca", cobrancaRouter);
// RBAC fino por rota dentro do próprio módulo (ver sincronizacao-legado.routes.ts).
app.use("/api/sincronizacao-legado", sincronizacaoLegadoRouter);
// RBAC fino por rota dentro do próprio módulo (ver importacao-legado.routes.ts).
app.use("/api/importacao-legado", importacaoLegadoRouter);
app.use("/api/asaas", requireRole("ADMINISTRADOR", "FINANCEIRO"), asaasRouter);
app.use("/api/configuracoes", requireRole("ADMINISTRADOR"), configuracoesRouter);
app.use("/api/auditoria", requireRole("ADMINISTRADOR"), auditoriaRouter);

// Middleware central de tratamento de erros (deve ser o último).
app.use(errorHandler);
