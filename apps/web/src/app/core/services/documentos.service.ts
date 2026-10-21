import { HttpClient, HttpParams, HttpResponse } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import {
  AtualizarDocumentoPayload,
  Documento,
  DocumentoAguardandoConferencia,
  DocumentosDaMatricula,
  EscopoDocumento,
  PaginaDocumentos,
  SituacaoDeferimentoDocumento,
  TipoDocumento,
} from "../models/documento.model";

/** Filtros da consulta de documentos (e do download em lote). Datas em AAAA-MM-DD. */
export interface FiltrosDocumentos {
  situacao?: SituacaoDeferimentoDocumento | "";
  busca?: string;
  tipoId?: string;
  cursoId?: string;
  de?: string;
  ate?: string;
}

/** Só os filtros preenchidos (sem vazios), prontos para a query string ou o corpo. */
function filtrosLimpos(f: FiltrosDocumentos): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(f)) {
    const texto = typeof valor === "string" ? valor.trim() : "";
    if (texto && ["situacao", "busca", "tipoId", "cursoId", "de", "ate"].includes(chave)) {
      saida[chave] = texto;
    }
  }
  return saida;
}

@Injectable({ providedIn: "root" })
export class DocumentosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/documentos`;

  listarTipos(incluirInativos = false): Observable<TipoDocumento[]> {
    return this.http.get<TipoDocumento[]>(`${this.baseUrl}/tipos`, {
      params: { incluirInativos },
    });
  }

  criarTipo(payload: {
    nome: string;
    escopo: EscopoDocumento;
    obrigatorio: boolean;
    ordem: number;
  }): Observable<TipoDocumento> {
    return this.http.post<TipoDocumento>(`${this.baseUrl}/tipos`, payload);
  }

  atualizarTipo(
    id: string,
    payload: { nome?: string; obrigatorio?: boolean; ordem?: number; ativo?: boolean },
  ): Observable<TipoDocumento> {
    return this.http.put<TipoDocumento>(`${this.baseUrl}/tipos/${id}`, payload);
  }

  /** Todos os documentos enviados, com filtro de situação, busca por aluno e paginação. */
  listar(
    filtros: FiltrosDocumentos & { page: number; pageSize: number },
  ): Observable<PaginaDocumentos> {
    let params = new HttpParams().set("page", filtros.page).set("pageSize", filtros.pageSize);
    for (const [chave, valor] of Object.entries(filtrosLimpos(filtros))) {
      params = params.set(chave, valor);
    }
    return this.http.get<PaginaDocumentos>(this.baseUrl, { params });
  }

  /** ZIP com os documentos escolhidos (ids) ou com todos os que casam com os filtros. */
  baixarLote(selecao: {
    ids?: string[];
    filtros?: FiltrosDocumentos;
  }): Observable<HttpResponse<Blob>> {
    const corpo = selecao.ids?.length
      ? { ids: selecao.ids }
      : { filtros: filtrosLimpos(selecao.filtros ?? {}) };
    return this.http.post(`${this.baseUrl}/download-lote`, corpo, {
      responseType: "blob",
      observe: "response",
    });
  }

  aguardandoConferencia(): Observable<DocumentoAguardandoConferencia[]> {
    return this.http.get<DocumentoAguardandoConferencia[]>(
      `${this.baseUrl}/aguardando-conferencia`,
    );
  }

  listarDaMatricula(matriculaId: string): Observable<DocumentosDaMatricula> {
    return this.http.get<DocumentosDaMatricula>(`${this.baseUrl}/matriculas/${matriculaId}`);
  }

  anexar(matriculaId: string, tipoId: string, arquivo: File): Observable<Documento> {
    const form = new FormData();
    form.append("arquivo", arquivo);
    return this.http.post<Documento>(
      `${this.baseUrl}/matriculas/${matriculaId}/tipos/${tipoId}/arquivo`,
      form,
    );
  }

  atualizar(
    matriculaId: string,
    tipoId: string,
    payload: AtualizarDocumentoPayload,
  ): Observable<Documento> {
    return this.http.put<Documento>(
      `${this.baseUrl}/matriculas/${matriculaId}/tipos/${tipoId}`,
      payload,
    );
  }

  removerArquivo(documentoId: string): Observable<Documento> {
    return this.http.delete<Documento>(`${this.baseUrl}/${documentoId}/arquivo`);
  }

  /** O arquivo para exibir na tela (Content-Disposition: inline). */
  visualizar(documentoId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${documentoId}/arquivo`, {
      params: { inline: "1" },
      responseType: "blob",
    });
  }

  /** Baixa via HttpClient (precisa do header de autenticação, então não dá
   * pra usar um link direto). */
  baixar(documentoId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${documentoId}/arquivo`, { responseType: "blob" });
  }
}
