import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";

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
  parcelasNovas: number;
  parcelasAtualizadas: number;
  erros: number;
  /** Nome do curso no legado → quantidade de matrículas ignoradas (curso não existe no Ethos). */
  cursosSemCorrespondencia: Record<string, number> | null;
  detalhes: { erros?: string[]; prefixosTruncados?: string[] } | null;
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

  /** Dispara a busca de TODOS os alunos do legado (segundo plano). */
  iniciarLote(): Observable<LoteLegado> {
    return this.http.post<LoteLegado>(`${this.baseUrl}/lote`, {});
  }

  /** Último lote (em andamento ou concluído); null se nunca rodou. */
  ultimoLote(): Observable<LoteLegado | null> {
    return this.http.get<LoteLegado | null>(`${this.baseUrl}/lote/atual`);
  }

  confirmar(payload: ConfirmarImportacaoLegadoPayload): Observable<ResultadoImportacaoLegado> {
    return this.http.post<ResultadoImportacaoLegado>(`${this.baseUrl}/confirmar`, payload);
  }
}
