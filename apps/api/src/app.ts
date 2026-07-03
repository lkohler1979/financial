import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { requestContext } from "./middlewares/request-context";
import { errorHandler } from "./middlewares/error-handler";
import { alunosRouter } from "./modules/alunos/alunos.routes";
import { cursosRouter } from "./modules/cursos/cursos.routes";
import { matriculasRouter } from "./modules/matriculas/matriculas.routes";
import { financeiroRouter } from "./modules/financeiro/financeiro.routes";
import { importacaoRouter } from "./modules/importacao/importacao.routes";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "ethos-financial-api" });
});

// Contexto de usuário (auditoria) — aplicado às rotas de negócio.
app.use("/api", requestContext);

app.use("/api/alunos", alunosRouter);
app.use("/api/cursos", cursosRouter);
app.use("/api/matriculas", matriculasRouter);
app.use("/api/financeiro", financeiroRouter);
app.use("/api/importacao", importacaoRouter);

// TODO (próximos sprints): registrar demais módulos de negócio:
// app.use("/api/cobranca", cobrancaRouter);
// app.use("/api/relatorios", relatoriosRouter);
// app.use("/api/configuracoes", configuracoesRouter);
// app.use("/api/auditoria", auditoriaRouter);
// app.use("/api/auth", authRouter);

// Middleware central de tratamento de erros (deve ser o último).
app.use(errorHandler);
