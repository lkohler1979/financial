import { HttpClient, HttpParams } from "@angular/common/http";
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
  listar(filtros: {
    situacao?: SituacaoDeferimentoDocumento | "";
    busca?: string;
    page: number;
    pageSize: number;
  }): Observable<PaginaDocumentos> {
    let params = new HttpParams().set("page", filtros.page).set("pageSize", filtros.pageSize);
    if (filtros.situacao) params = params.set("situacao", filtros.situacao);
    if (filtros.busca?.trim()) params = params.set("busca", filtros.busca.trim());
    return this.http.get<PaginaDocumentos>(this.baseUrl, { params });
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
