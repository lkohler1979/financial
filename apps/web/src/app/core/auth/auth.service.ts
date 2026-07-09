import { HttpClient } from "@angular/common/http";
import { computed, inject, Injectable, signal } from "@angular/core";
import { Observable, tap } from "rxjs";
import { environment } from "../../../environments/environment";
import { LoginPayload, LoginResponse, Perfil, UsuarioAutenticado } from "../models/auth.model";

const CHAVE_TOKEN = "ethos.token";
const CHAVE_USUARIO = "ethos.usuario";

function lerUsuarioArmazenado(): UsuarioAutenticado | null {
  const bruto = localStorage.getItem(CHAVE_USUARIO);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto) as UsuarioAutenticado;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  private readonly usuarioSignal = signal<UsuarioAutenticado | null>(lerUsuarioArmazenado());

  readonly usuario = computed(() => this.usuarioSignal());
  readonly autenticado = computed(() => this.usuarioSignal() !== null);

  login(payload: LoginPayload): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/login`, payload).pipe(
      tap((resposta) => {
        localStorage.setItem(CHAVE_TOKEN, resposta.token);
        localStorage.setItem(CHAVE_USUARIO, JSON.stringify(resposta.usuario));
        this.usuarioSignal.set(resposta.usuario);
      }),
    );
  }

  logout(): void {
    localStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_USUARIO);
    this.usuarioSignal.set(null);
  }

  obterToken(): string | null {
    return localStorage.getItem(CHAVE_TOKEN);
  }

  temPerfil(...perfis: Perfil[]): boolean {
    const usuario = this.usuarioSignal();
    return !!usuario && perfis.includes(usuario.perfil);
  }
}
