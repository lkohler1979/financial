import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { Solicitacao, StatusSolicitacao, TipoSolicitacao } from "../models/portal.model";

/** Lado da equipe: fila de pedidos dos alunos e cadastro dos tipos. */
@Injectable({ providedIn: "root" })
export class SolicitacoesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/solicitacoes`;

  listar(status?: StatusSolicitacao): Observable<Solicitacao[]> {
    return this.http.get<Solicitacao[]>(this.baseUrl, { params: status ? { status } : {} });
  }

  atender(id: string, arquivo: File, resposta?: string): Observable<Solicitacao> {
    const form = new FormData();
    form.append("arquivo", arquivo);
    if (resposta) form.append("resposta", resposta);
    return this.http.post<Solicitacao>(`${this.baseUrl}/${id}/atender`, form);
  }

  recusar(id: string, motivo: string): Observable<Solicitacao> {
    return this.http.post<Solicitacao>(`${this.baseUrl}/${id}/recusar`, { motivo });
  }

  baixar(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${id}/arquivo`, { responseType: "blob" });
  }

  listarTipos(incluirInativos = false): Observable<TipoSolicitacao[]> {
    return this.http.get<TipoSolicitacao[]>(`${this.baseUrl}/tipos`, { params: { incluirInativos } });
  }

  criarTipo(payload: Partial<TipoSolicitacao>): Observable<TipoSolicitacao> {
    return this.http.post<TipoSolicitacao>(`${this.baseUrl}/tipos`, payload);
  }

  atualizarTipo(id: string, payload: Partial<TipoSolicitacao>): Observable<TipoSolicitacao> {
    return this.http.put<TipoSolicitacao>(`${this.baseUrl}/tipos/${id}`, payload);
  }
}
