import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { LoteTitulos, ResultadoTitulosDoAluno } from "../models/titulo-aluno.model";

export interface PreviaParcelaLegado {
  tituloId: string;
  descricao: string;
  parcela: string;
  vencimento: string | null;
  valor: number;
  valorPago: number;
  estado: string;
  diasAtraso: number;
  /** Tipo de título do legado (ex.: "Mensalidade", "Renegociação"),
   * confirmado ao vivo em 2026-09-17 — exibido para conferência antes da
   * confirmação da importação. */
  tipoTitulo: string | null;
  jaExisteNoEthos: boolean;
  statusEthos: string | null;
  pagoNoLegado: boolean;
}

export interface PreviaCursoLegado {
  alunocursoId: string;
  cursoLegadoNome: string;
  cursoEthosSugerido: { id: string; codigo: string; nome: string } | null;
  matriculaJaExiste: boolean;
  parcelas: PreviaParcelaLegado[];
}

export interface PreviaImportacaoLegado {
  encontrado: boolean;
  cpf: string;
  nome: string;
  alunoJaExiste: boolean;
  cursos: PreviaCursoLegado[];
}

export interface ConfirmarImportacaoLegadoPayload {
  cpf: string;
  selecoes: Array<{
    alunocursoId: string;
    cursoEthosId: string;
    importarMatricula: boolean;
    titulosSelecionados: string[];
  }>;
}

export interface ResultadoImportacaoLegado {
  alunoCriado: boolean;
  alunoId: string | null;
  matriculasNovas: number;
  parcelasNovas: number;
  parcelasAtualizadas: number;
  avisos: string[];
}

export type ResultadoDocumentoLegado =
  "BAIXADO" | "JA_IMPORTADO" | "MANTIDO_ETHOS" | "SEM_DOCUMENTO" | "SEM_ARQUIVO" | "ERRO";

export interface ItemDocumentoLegado {
  tipo: string;
  resultado: ResultadoDocumentoLegado;
  arquivo: string | null;
  bytes: number | null;
  /** Situação no Ethos depois da importação: PENDENTE | DEFERIDO | INDEFERIDO. */
  situacao: string | null;
  detalhe: string | null;
}

/** Resultado de buscar no legado os documentos de UM aluno e baixá-los para apps/documentos. */
export interface ResumoDocumentosLegado {
  aluno: { id: string; nome: string; cpf: string };
  baixados: number;
  jaImportados: number;
  mantidos: number;
  semDocumento: number;
  erros: number;
  itens: ItemDocumentoLegado[];
}

export type StatusLoteDocumentos = "EM_ANDAMENTO" | "CONCLUIDO" | "FALHOU" | "CANCELADO";

/** Filtros da lista de matrículas (os mesmos valem para escolher "todas do filtro"). */
export interface FiltrosMatriculasLote {
  alunoNome?: string;
  alunoCpf?: string;
  situacao?: string;
  situacaoCobrancaId?: string;
  tagId?: string;
  contratoAssinado?: boolean;
  tcdAssinado?: boolean;
  situacaoDocumentacao?: string;
  dataMatriculaInicio?: string;
  dataMatriculaFim?: string;
}

/** Andamento da busca em lote de documentos no legado (roda em segundo plano no worker). */
export interface LoteDocumentos {
  id: string;
  status: StatusLoteDocumentos;
  total: number;
  processados: number;
  baixados: number;
  jaImportados: number;
  mantidos: number;
  semDocumento: number;
  errosDocumentos: number;
  alunosComErro: number;
  mensagemFalha: string | null;
  criadoEm: string;
  finalizadoEm: string | null;
  /** Primeiros alunos com erro (o relatório traz todos). */
  problemas: { id: string; alunoNome: string; mensagem: string | null }[];
}

export type StatusLoteLegado = "ENUMERANDO" | "IMPORTANDO" | "CONCLUIDO" | "FALHOU";

/** Andamento da busca em lote de todos os alunos do legado (roda em segundo plano no worker). */
export interface LoteLegado {
  id: string;
  status: StatusLoteLegado;
  consultas: number;
  pessoasEncontradas: number;
  pessoasProcessadas: number;
  semCpf: number;
  alunosCriados: number;
  matriculasNovas: number;
  cursosCriados: number;
  parcelasNovas: number;
  parcelasAtualizadas: number;
  erros: number;
  /** Quantidade de linhas do relatório por tipo (ALUNO_SEM_CPF, CURSO_CRIADO, ERRO…). */
  ocorrenciasPorTipo: Record<string, number>;
  mensagemFalha: string | null;
  criadoEm: string;
  finalizadoEm: string | null;
}

@Injectable({ providedIn: "root" })
export class ImportacaoLegadoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/importacao-legado`;

  buscarPorCpf(cpf: string): Observable<PreviaImportacaoLegado> {
    const params = new HttpParams().set("cpf", cpf);
    return this.http.get<PreviaImportacaoLegado>(`${this.baseUrl}/buscar-cpf`, { params });
  }

  /** Busca no legado os documentos do aluno e baixa os arquivos (CPF, RG, comprovante…). */
  importarDocumentos(alunoId: string): Observable<ResumoDocumentosLegado> {
    return this.http.post<ResumoDocumentosLegado>(
      `${this.baseUrl}/alunos/${alunoId}/documentos`,
      {},
    );
  }

  /** Busca no legado os documentos dos alunos de várias matrículas (marcadas, ou todas do filtro). */
  iniciarDocumentosLote(selecao: {
    matriculaIds?: string[];
    filtros?: FiltrosMatriculasLote;
  }): Observable<LoteDocumentos> {
    return this.http.post<LoteDocumentos>(`${this.baseUrl}/documentos/lote`, selecao);
  }

  ultimoDocumentosLote(): Observable<LoteDocumentos | null> {
    return this.http.get<LoteDocumentos | null>(`${this.baseUrl}/documentos/lote/atual`);
  }

  cancelarDocumentosLote(id: string): Observable<LoteDocumentos> {
    return this.http.post<LoteDocumentos>(`${this.baseUrl}/documentos/lote/${id}/cancelar`, {});
  }

  baixarRelatorioDocumentosLote(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/documentos/lote/${id}/relatorio`, {
      responseType: "blob",
    });
  }

  /** Consulta o legado e grava os títulos que faltam de UM aluno (na hora). */
  importarTitulosDoAluno(alunoId: string): Observable<ResultadoTitulosDoAluno> {
    return this.http.post<ResultadoTitulosDoAluno>(`${this.baseUrl}/alunos/${alunoId}/titulos`, {});
  }

  /** Dispara a busca dos títulos que faltam de TODOS os alunos (segundo plano). */
  iniciarLoteTitulos(): Observable<LoteTitulos> {
    return this.http.post<LoteTitulos>(`${this.baseUrl}/titulos/lote`, {});
  }

  /** Último lote de títulos (em andamento ou concluído); null se nunca rodou. */
  ultimoLoteTitulos(): Observable<LoteTitulos | null> {
    return this.http.get<LoteTitulos | null>(`${this.baseUrl}/titulos/lote/atual`);
  }

  /** Dispara a busca de TODOS os alunos do legado (segundo plano). */
  iniciarLote(): Observable<LoteLegado> {
    return this.http.post<LoteLegado>(`${this.baseUrl}/lote`, {});
  }

  /** Último lote (em andamento ou concluído); null se nunca rodou. */
  ultimoLote(): Observable<LoteLegado | null> {
    return this.http.get<LoteLegado | null>(`${this.baseUrl}/lote/atual`);
  }

  /** Planilha (.xlsx) com tudo que não entrou ou entrou com ressalva no último lote. */
  baixarRelatorioLote(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/lote/atual/relatorio`, { responseType: "blob" });
  }

  confirmar(payload: ConfirmarImportacaoLegadoPayload): Observable<ResultadoImportacaoLegado> {
    return this.http.post<ResultadoImportacaoLegado>(`${this.baseUrl}/confirmar`, payload);
  }
}
