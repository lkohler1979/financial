import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";

export interface PreviaParcelaLegado {
  tituloId: string;
  descricao: string;
  parcela: string;
  vencimento: string | null;
  valor: number;
  valorPago: number;
  estado: string;
  diasAtraso: number;
  jaExisteNoEthos: boolean;
}

export interface PreviaCursoLegado {
  alunocursoId: string;
  cursoLegadoNome: string;
  cursoEthosSugerido: { id: string; codigo: string; nome: string } | null;
  matriculaJaExiste: boolean;
  parcelas: PreviaParcelaLegado[];
}

export interface PreviaImportacaoLegado {
  encontrado: boolean;
  cpf: string;
  nome: string;
  alunoJaExiste: boolean;
  cursos: PreviaCursoLegado[];
}

export interface ConfirmarImportacaoLegadoPayload {
  cpf: string;
  selecoes: Array<{ alunocursoId: string; cursoEthosId: string }>;
}

export interface ResultadoImportacaoLegado {
  alunoCriado: boolean;
  alunoId: string;
  matriculasNovas: number;
  parcelasNovas: number;
  avisos: string[];
}

@Injectable({ providedIn: "root" })
export class ImportacaoLegadoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/importacao-legado`;

  buscarPorCpf(cpf: string): Observable<PreviaImportacaoLegado> {
    const params = new HttpParams().set("cpf", cpf);
    return this.http.get<PreviaImportacaoLegado>(`${this.baseUrl}/buscar-cpf`, { params });
  }

  confirmar(payload: ConfirmarImportacaoLegadoPayload): Observable<ResultadoImportacaoLegado> {
    return this.http.post<ResultadoImportacaoLegado>(`${this.baseUrl}/confirmar`, payload);
  }
}
