import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { DashboardCobranca, DashboardGeral } from "../models/dashboard.model";

@Injectable({ providedIn: "root" })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/dashboard`;

  geral(): Observable<DashboardGeral> {
    return this.http.get<DashboardGeral>(`${this.baseUrl}/geral`);
  }

  cobranca(): Observable<DashboardCobranca> {
    return this.http.get<DashboardCobranca>(`${this.baseUrl}/cobranca`);
  }
}
