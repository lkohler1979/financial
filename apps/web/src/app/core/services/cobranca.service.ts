import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import {
  FichaCobranca,
  ObservacaoCobranca,
  ResultadoLote,
  SituacaoCobranca,
  Tag,
} from "../models/cobranca.model";
import { Matricula } from "../models/matricula.model";

export interface AplicarLotePayload {
  matriculaIds: string[];
  situacaoCobrancaId?: string;
  tagIds?: string[];
  observacao?: string;
}

@Injectable({ providedIn: "root" })
export class CobrancaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/cobranca`;

  // --- Situações ---
  listarSituacoes(ativa?: boolean): Observable<SituacaoCobranca[]> {
    let params = new HttpParams();
    if (ativa !== undefined) params = params.set("ativa", ativa);
    return this.http.get<SituacaoCobranca[]>(`${this.baseUrl}/situacoes`, { params });
  }

  criarSituacao(payload: Partial<SituacaoCobranca>): Observable<SituacaoCobranca> {
    return this.http.post<SituacaoCobranca>(`${this.baseUrl}/situacoes`, payload);
  }

  // --- Tags ---
  listarTags(): Observable<Tag[]> {
    return this.http.get<Tag[]>(`${this.baseUrl}/tags`);
  }

  criarTag(nome: string): Observable<Tag> {
    return this.http.post<Tag>(`${this.baseUrl}/tags`, { nome });
  }

  // --- Ficha da matrícula ---
  obterFicha(matriculaId: string): Observable<FichaCobranca> {
    return this.http.get<FichaCobranca>(`${this.baseUrl}/matriculas/${matriculaId}`);
  }

  mudarSituacao(matriculaId: string, situacaoCobrancaId: string): Observable<Matricula> {
    return this.http.put<Matricula>(`${this.baseUrl}/matriculas/${matriculaId}/situacao`, {
      situacaoCobrancaId,
    });
  }

  adicionarTag(matriculaId: string, tagId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/matriculas/${matriculaId}/tags`, { tagId });
  }

  removerTag(matriculaId: string, tagId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/matriculas/${matriculaId}/tags/${tagId}`);
  }

  adicionarObservacao(matriculaId: string, texto: string): Observable<ObservacaoCobranca> {
    return this.http.post<ObservacaoCobranca>(
      `${this.baseUrl}/matriculas/${matriculaId}/observacoes`,
      { texto },
    );
  }

  // --- Ação em lote ---
  aplicarLote(payload: AplicarLotePayload): Observable<ResultadoLote> {
    return this.http.post<ResultadoLote>(`${this.baseUrl}/lote`, payload);
  }
}
