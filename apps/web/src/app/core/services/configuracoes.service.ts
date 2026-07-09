import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import {
  AtualizarConfiguracaoPayload,
  Configuracao,
  ContagensLimpezaBase,
} from "../models/configuracao.model";

@Injectable({ providedIn: "root" })
export class ConfiguracoesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/configuracoes`;

  obter(): Observable<Configuracao> {
    return this.http.get<Configuracao>(this.baseUrl);
  }

  atualizar(payload: AtualizarConfiguracaoPayload): Observable<Configuracao> {
    return this.http.put<Configuracao>(this.baseUrl, payload);
  }

  /** Apaga alunos, cursos, matrículas, parcelas, cobrança e histórico de
   * relatórios — usado para zerar dados de teste antes de importar uma
   * planilha real. Exige a frase de confirmação exata (validada no backend). */
  limparBase(confirmacao: string): Observable<{ contagens: ContagensLimpezaBase }> {
    return this.http.post<{ contagens: ContagensLimpezaBase }>(`${this.baseUrl}/limpar-base`, {
      confirmacao,
    });
  }
}
