import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { NfsePagamento, NfsePrevia, NfseResultadoEmissao, NfseSituacaoNacional } from "../models/nfse.model";

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

  /** Pagamentos realizados (qualquer tipo) por aluno/CPF/matrícula e/ou período (AAAA-MM-DD). */
  pagamentos(filtros: { busca?: string; de?: string; ate?: string }): Observable<NfsePagamento[]> {
    let params = new HttpParams();
    if (filtros.busca) params = params.set("busca", filtros.busca);
    if (filtros.de) params = params.set("de", filtros.de);
    if (filtros.ate) params = params.set("ate", filtros.ate);
    return this.http.get<NfsePagamento[]>(`${this.baseUrl}/pagamentos`, { params });
  }

  /** Emite a nota de um pagamento; `competencia` (AAAA-MM-DD) opcional. */
  emitirIndividual(parcelaId: string, competencia?: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/parcelas/${parcelaId}/emitir-individual`, competencia ? { competencia } : {});
  }

  /** PDF (DANFSe) da nota emitida direto na SEFIN. */
  danfse(parcelaId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/parcelas/${parcelaId}/danfse`, { responseType: "blob" });
  }

  situacaoNacional(): Observable<NfseSituacaoNacional> {
    return this.http.get<NfseSituacaoNacional>(`${this.baseUrl}/nacional/situacao`);
  }

  salvarCertificado(pfxBase64: string, senha: string): Observable<{ titular: string; cnpj: string | null; validoAte: string }> {
    return this.http.put<{ titular: string; cnpj: string | null; validoAte: string }>(`${this.baseUrl}/certificado`, { pfxBase64, senha });
  }

  removerCertificado(): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/certificado`);
  }

  testarConexao(): Observable<{ ok: boolean; mensagem: string }> {
    return this.http.post<{ ok: boolean; mensagem: string }>(`${this.baseUrl}/nacional/testar`, {});
  }
}
