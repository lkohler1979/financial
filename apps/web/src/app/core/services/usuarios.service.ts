import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { Paginado } from "../models/paginado.model";
import { AtualizarUsuarioPayload, CriarUsuarioPayload, Usuario } from "../models/usuario.model";

@Injectable({ providedIn: "root" })
export class UsuariosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/usuarios`;

  listar(opcoes: { busca?: string; page?: number; pageSize?: number } = {}): Observable<
    Paginado<Usuario>
  > {
    let params = new HttpParams();
    if (opcoes.busca) params = params.set("busca", opcoes.busca);
    if (opcoes.page) params = params.set("page", opcoes.page);
    if (opcoes.pageSize) params = params.set("pageSize", opcoes.pageSize);
    return this.http.get<Paginado<Usuario>>(this.baseUrl, { params });
  }

  buscarPorId(id: string): Observable<Usuario> {
    return this.http.get<Usuario>(`${this.baseUrl}/${id}`);
  }

  criar(payload: CriarUsuarioPayload): Observable<Usuario> {
    return this.http.post<Usuario>(this.baseUrl, payload);
  }

  atualizar(id: string, payload: AtualizarUsuarioPayload): Observable<Usuario> {
    return this.http.put<Usuario>(`${this.baseUrl}/${id}`, payload);
  }

  alterarSenha(id: string, senha: string): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${id}/senha`, { senha });
  }
}
