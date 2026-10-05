import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import {
  PortalCobranca,
  PortalDocumentos,
  PortalMe,
  PortalParcela,
  Solicitacao,
  TipoSolicitacao,
} from "../models/portal.model";
import { FormaPagamento } from "../models/tipo-cobranca.model";

/** Chamadas da área do aluno (`/api/portal`) — o interceptor usa o token do aluno. */
@Injectable({ providedIn: "root" })
export class PortalService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/portal`;

  me(): Observable<PortalMe> {
    return this.http.get<PortalMe>(`${this.baseUrl}/me`);
  }

  documentos(matriculaId: string): Observable<PortalDocumentos> {
    return this.http.get<PortalDocumentos>(`${this.baseUrl}/matriculas/${matriculaId}/documentos`);
  }

  enviarDocumento(matriculaId: string, tipoId: string, arquivo: File): Observable<unknown> {
    const form = new FormData();
    form.append("arquivo", arquivo);
    return this.http.post(
      `${this.baseUrl}/matriculas/${matriculaId}/documentos/${tipoId}/arquivo`,
      form,
    );
  }

  baixarDocumento(documentoId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/documentos/${documentoId}/arquivo`, { responseType: "blob" });
  }

  parcelas(): Observable<PortalParcela[]> {
    return this.http.get<PortalParcela[]>(`${this.baseUrl}/parcelas`);
  }

  formasPagamento(): Observable<FormaPagamento[]> {
    return this.http.get<FormaPagamento[]>(`${this.baseUrl}/formas-pagamento`);
  }

  gerarCobranca(parcelaId: string, formaPagamento?: FormaPagamento): Observable<PortalCobranca> {
    return this.http.post<PortalCobranca>(`${this.baseUrl}/parcelas/${parcelaId}/cobranca`, {
      formaPagamento,
    });
  }

  tiposSolicitacao(): Observable<TipoSolicitacao[]> {
    return this.http.get<TipoSolicitacao[]>(`${this.baseUrl}/tipos-solicitacao`);
  }

  solicitacoes(): Observable<Solicitacao[]> {
    return this.http.get<Solicitacao[]>(`${this.baseUrl}/solicitacoes`);
  }

  solicitar(payload: {
    tipoSolicitacaoId: string;
    matriculaId: string | null;
    observacao: string | null;
  }): Observable<Solicitacao> {
    return this.http.post<Solicitacao>(`${this.baseUrl}/solicitacoes`, payload);
  }

  baixarSolicitacao(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/solicitacoes/${id}/arquivo`, { responseType: "blob" });
  }
}
