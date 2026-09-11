import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";

export interface ResultadoSincronizacaoLegado {
  tituloConsultados: number;
  parcelasAtualizadas: number;
  naoEncontradosNoLegado: number;
}

@Injectable({ providedIn: "root" })
export class SincronizacaoLegadoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/sincronizacao-legado`;

  /** Botão manual na Ficha de Cobrança — consulta síncrona (1 matrícula). */
  sincronizarMatricula(matriculaId: string): Observable<ResultadoSincronizacaoLegado> {
    return this.http.post<ResultadoSincronizacaoLegado>(
      `${this.baseUrl}/matriculas/${matriculaId}/sincronizar`,
      {},
    );
  }
}
