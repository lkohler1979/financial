import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { Sacado } from "../models/sacado.model";

@Injectable({ providedIn: "root" })
export class SacadosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/sacados`;

  buscar(busca: string): Observable<Sacado[]> {
    return this.http.get<Sacado[]>(this.baseUrl, { params: new HttpParams().set("busca", busca) });
  }
}
