import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import {
  AtualizarDocumentoPayload,
  Documento,
  DocumentosDaMatricula,
} from "../models/documento.model";

@Injectable({ providedIn: "root" })
export class DocumentosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/documentos`;

  listarDaMatricula(matriculaId: string): Observable<DocumentosDaMatricula> {
    return this.http.get<DocumentosDaMatricula>(`${this.baseUrl}/matriculas/${matriculaId}`);
  }

  anexar(matriculaId: string, tipoId: string, arquivo: File): Observable<Documento> {
    const form = new FormData();
    form.append("arquivo", arquivo);
    return this.http.post<Documento>(
      `${this.baseUrl}/matriculas/${matriculaId}/tipos/${tipoId}/arquivo`,
      form,
    );
  }

  atualizar(
    matriculaId: string,
    tipoId: string,
    payload: AtualizarDocumentoPayload,
  ): Observable<Documento> {
    return this.http.put<Documento>(
      `${this.baseUrl}/matriculas/${matriculaId}/tipos/${tipoId}`,
      payload,
    );
  }

  removerArquivo(documentoId: string): Observable<Documento> {
    return this.http.delete<Documento>(`${this.baseUrl}/${documentoId}/arquivo`);
  }

  /** Baixa via HttpClient (precisa do header de autenticação, então não dá
   * pra usar um link direto). */
  baixar(documentoId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${documentoId}/arquivo`, { responseType: "blob" });
  }
}
