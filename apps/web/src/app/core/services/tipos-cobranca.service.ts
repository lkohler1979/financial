import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { TipoCobranca, TipoCobrancaPayload } from "../models/tipo-cobranca.model";

@Injectable({ providedIn: "root" })
export class TiposCobrancaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/tipos-cobranca`;

  listar(incluirInativos = false): Observable<TipoCobranca[]> {
    const params = new HttpParams().set("incluirInativos", incluirInativos);
    return this.http.get<TipoCobranca[]>(this.baseUrl, { params });
  }

  criar(payload: TipoCobrancaPayload): Observable<TipoCobranca> {
    return this.http.post<TipoCobranca>(this.baseUrl, payload);
  }

  atualizar(id: string, payload: TipoCobrancaPayload): Observable<TipoCobranca> {
    return this.http.put<TipoCobranca>(`${this.baseUrl}/${id}`, payload);
  }
}
