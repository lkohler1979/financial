import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { NfsePrevia, NfseResultadoEmissao } from "../models/nfse.model";

@Injectable({ providedIn: "root" })
export class NfseService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/nfse`;

  /** `mes` = "AAAA-MM" (competência); sem ele, o mês anterior. */
  previa(mes?: string): Observable<NfsePrevia> {
    const params = mes ? new HttpParams().set("mes", mes) : undefined;
    return this.http.get<NfsePrevia>(`${this.baseUrl}/previa`, { params });
  }

  emitir(mes?: string): Observable<NfseResultadoEmissao> {
    return this.http.post<NfseResultadoEmissao>(`${this.baseUrl}/emitir`, mes ? { mes } : {});
  }

  atualizarStatus(): Observable<{ conferidas: number; autorizadas: number; erros: number }> {
    return this.http.post<{ conferidas: number; autorizadas: number; erros: number }>(
      `${this.baseUrl}/atualizar-status`,
      {},
    );
  }

  reemitir(parcelaId: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/parcelas/${parcelaId}/emitir`, {});
  }
}
