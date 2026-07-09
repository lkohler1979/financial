import { NextFunction, Request, Response } from "express";
import {
  executarComContextoAuditoria,
  obterContextoAuditoria,
} from "../modules/auditoria/auditoria.context";
import { registrarAuditoria, AcaoAuditoria } from "../modules/auditoria/auditoria.service";
import { usuarioAtual } from "../shared/utils/http";

const METODOS_AUDITAVEIS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function acaoPorMetodo(metodo: string): AcaoAuditoria {
  if (metodo === "POST") return "CRIACAO";
  if (metodo === "DELETE") return "EXCLUSAO";
  return "ATUALIZACAO";
}

function entidadePorCaminho(caminhoOriginal: string): string {
  const partes = caminhoOriginal.split("?")[0].split("/").filter(Boolean);
  const modulo = partes[1];
  const submodulo = partes[2];

  if (modulo === "alunos") return "Aluno";
  if (modulo === "cursos") return "Curso";
  if (modulo === "matriculas") return "Matricula";
  if (modulo === "financeiro") return "Parcela";
  if (modulo === "importacao") return "Importacao";
  if (modulo === "relatorios") return "RelatorioInadimplencia";
  if (modulo === "configuracoes") return "Configuracao";
  if (modulo === "cobranca" && submodulo === "situacoes") return "SituacaoCobranca";
  if (modulo === "cobranca" && submodulo === "tags") return "Tag";
  if (modulo === "cobranca" && submodulo === "matriculas") return "Cobranca";
  if (modulo === "cobranca") return "Cobranca";

  return modulo ? modulo[0].toUpperCase() + modulo.slice(1) : "Api";
}

function entidadeId(req: Request): string {
  const params = req.params as Record<string, string | undefined>;
  return (
    params.id ??
    params.matriculaId ??
    params.tagId ??
    params.situacaoId ??
    `${req.method} ${req.originalUrl.split("?")[0]}`
  );
}

export function auditoriaRequestContext(req: Request, res: Response, next: NextFunction): void {
  executarComContextoAuditoria(usuarioAtual(req), () => {
    res.on("finish", () => {
      const contexto = obterContextoAuditoria();
      if (!METODOS_AUDITAVEIS.has(req.method)) return;
      if (res.statusCode >= 400) return;
      if (req.originalUrl.startsWith("/api/auditoria")) return;
      if (contexto?.auditoriaRegistrada) return;

      void registrarAuditoria({
        usuarioId: contexto?.usuarioId ?? usuarioAtual(req),
        entidade: entidadePorCaminho(req.originalUrl),
        entidadeId: entidadeId(req),
        acao: acaoPorMetodo(req.method),
        detalhes: {
          origem: "middleware",
          metodo: req.method,
          rota: req.originalUrl.split("?")[0],
          statusCode: res.statusCode,
        },
      }).catch(() => {
        // A resposta de negócio já foi enviada; falha de auditoria automática
        // não pode alterar o resultado da requisição.
      });
    });

    next();
  });
}
