import { HttpClient } from "@angular/common/http";
import { computed, inject, Injectable, signal } from "@angular/core";
import { Observable, tap } from "rxjs";
import { environment } from "../../../environments/environment";

const CHAVE_TOKEN = "ethos.aluno.token";
const CHAVE_ALUNO = "ethos.aluno.dados";

export interface AlunoLogado {
  id: string;
  codigo: string | null;
  nome: string;
}

interface LoginAlunoResposta {
  token: string;
  aluno: AlunoLogado;
}

function lerAlunoArmazenado(): AlunoLogado | null {
  try {
    const bruto = localStorage.getItem(CHAVE_ALUNO);
    return bruto ? (JSON.parse(bruto) as AlunoLogado) : null;
  } catch {
    return null;
  }
}

/** Sessão da área do aluno — separada da sessão da equipe (outras chaves de
 * armazenamento), para as duas poderem coexistir no mesmo navegador. */
@Injectable({ providedIn: "root" })
export class AlunoAuthService {
  private readonly http = inject(HttpClient);
  private readonly alunoSignal = signal<AlunoLogado | null>(lerAlunoArmazenado());

  readonly aluno = computed(() => this.alunoSignal());
  readonly autenticado = computed(() => this.alunoSignal() !== null);

  /** `dataNascimento` no formato YYYY-MM-DD. */
  login(cpf: string, dataNascimento: string): Observable<LoginAlunoResposta> {
    return this.http
      .post<LoginAlunoResposta>(`${environment.apiUrl}/portal/login`, { cpf, dataNascimento })
      .pipe(
        tap((r) => {
          localStorage.setItem(CHAVE_TOKEN, r.token);
          localStorage.setItem(CHAVE_ALUNO, JSON.stringify(r.aluno));
          this.alunoSignal.set(r.aluno);
        }),
      );
  }

  logout(): void {
    localStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_ALUNO);
    this.alunoSignal.set(null);
  }

  obterToken(): string | null {
    return localStorage.getItem(CHAVE_TOKEN);
  }
}
