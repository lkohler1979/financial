import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";

export type AsaasBillingType = "BOLETO" | "PIX" | "CREDIT_CARD";

export interface AsaasCobrancaResultado {
  asaasPaymentId: string;
  asaasBillingType: AsaasBillingType | null;
  asaasBoletoUrl: string | null;
  asaasLinhaDigitavel: string | null;
  asaasInvoiceUrl: string | null;
  asaasPixQrCodeImagem: string | null;
  asaasPixCopiaECola: string | null;
}

@Injectable({ providedIn: "root" })
export class AsaasService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/asaas`;

  /**
   * Gera a cobrança da Parcela via Asaas — Boleto, Pix ou Cartão (idempotente:
   * se a parcela já tem uma cobrança gerada, o backend devolve ela em vez de
   * criar outra). Cartão nunca envia dado de cartão nenhum — o cliente paga
   * pela `asaasInvoiceUrl`, a página segura do próprio Asaas.
   */
  gerarCobranca(
    parcelaId: string,
    billingType: AsaasBillingType,
  ): Observable<AsaasCobrancaResultado> {
    return this.http.post<AsaasCobrancaResultado>(
      `${this.baseUrl}/parcelas/${parcelaId}/cobranca`,
      { billingType },
    );
  }
}
