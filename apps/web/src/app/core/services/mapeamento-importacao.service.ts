import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import {
  AtualizarMapeamentoPayload,
  CamposDisponiveisPorTabela,
  CriarMapeamentoPayload,
  MapeamentoImportacao,
} from "../models/mapeamento-importacao.model";

@Injectable({ providedIn: "root" })
export class MapeamentoImportacaoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/mapeamentos-importacao`;

  camposDisponiveis(): Observable<CamposDisponiveisPorTabela> {
    return this.http.get<CamposDisponiveisPorTabela>(`${this.baseUrl}/campos`);
  }

  listar(): Observable<MapeamentoImportacao[]> {
    return this.http.get<MapeamentoImportacao[]>(this.baseUrl);
  }

  criar(payload: CriarMapeamentoPayload): Observable<MapeamentoImportacao> {
    return this.http.post<MapeamentoImportacao>(this.baseUrl, payload);
  }

  atualizar(id: string, payload: AtualizarMapeamentoPayload): Observable<MapeamentoImportacao> {
    return this.http.put<MapeamentoImportacao>(`${this.baseUrl}/${id}`, payload);
  }

  remover(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
