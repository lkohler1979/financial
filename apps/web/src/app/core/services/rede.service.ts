import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";

@Injectable({ providedIn: "root" })
export class RedeService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/rede`;

  /** Estorno total de um pagamento de cartão (só administrador). `concluido: false` = a Rede ainda processa (D+1). */
  estornarCartao(parcelaId: string, motivo: string): Observable<{ concluido: boolean }> {
    return this.http.post<{ concluido: boolean }>(`${this.baseUrl}/parcelas/${parcelaId}/estorno`, { motivo });
  }

  conferirEstorno(parcelaId: string): Observable<{ situacao: "CONCLUIDO" | "NEGADO" | "PROCESSANDO" }> {
    return this.http.post<{ situacao: "CONCLUIDO" | "NEGADO" | "PROCESSANDO" }>(
      `${this.baseUrl}/parcelas/${parcelaId}/estorno/conferir`,
      {},
    );
  }
}
