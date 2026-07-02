import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "ethos-financial-api" });
});

// TODO: registrar rotas dos módulos de negócio:
// app.use("/api/alunos", alunosRouter);
// app.use("/api/cursos", cursosRouter);
// app.use("/api/matriculas", matriculasRouter);
// app.use("/api/financeiro", financeiroRouter);
// app.use("/api/importacao", importacaoRouter);
// app.use("/api/cobranca", cobrancaRouter);
// app.use("/api/relatorios", relatoriosRouter);
// app.use("/api/configuracoes", configuracoesRouter);
// app.use("/api/auditoria", auditoriaRouter);
// app.use("/api/auth", authRouter);
