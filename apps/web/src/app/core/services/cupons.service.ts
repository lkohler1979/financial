import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { Cupom, CupomPayload, CupomValidado } from "../models/cupom.model";

@Injectable({ providedIn: "root" })
export class CuponsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/cupons`;

  listar(): Observable<Cupom[]> {
    return this.http.get<Cupom[]>(this.baseUrl);
  }

  /** Confere se o cupom está cadastrado e válido (422 se não estiver). */
  validar(codigo: string): Observable<CupomValidado> {
    return this.http.get<CupomValidado>(`${this.baseUrl}/validar`, { params: { codigo } });
  }

  criar(payload: CupomPayload): Observable<Cupom> {
    return this.http.post<Cupom>(this.baseUrl, payload);
  }

  atualizar(id: string, payload: CupomPayload): Observable<Cupom> {
    return this.http.put<Cupom>(`${this.baseUrl}/${id}`, payload);
  }
}
