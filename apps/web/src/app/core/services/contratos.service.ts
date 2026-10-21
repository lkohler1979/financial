import { HttpClient, HttpResponse } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";

export type StatusContrato = "ENVIADO" | "ASSINADO" | "RECUSADO" | "CANCELADO";

export interface ContratoMatricula {
  id: string;
  matriculaId: string;
  status: StatusContrato;
  contratanteNome: string;
  contratanteEmail: string;
  autenticacao: "EMAIL" | "SMS" | "WHATSAPP" | "ICP_BRASIL";
  arquivoAssinadoChave: string | null;
  enviadoEm: string;
  assinadoEm: string | null;
}

/** Contrato de prestação de serviços da matrícula (gerado de um modelo e assinado na Clicksign). */
@Injectable({ providedIn: "root" })
export class ContratosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/contratos`;

  campos(): Observable<{ campo: string; descricao: string }[]> {
    return this.http.get<{ campo: string; descricao: string }[]>(`${this.baseUrl}/campos`);
  }

  enviarModelo(arquivo: File): Observable<{ nome: string }> {
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    return this.http.post<{ nome: string }>(`${this.baseUrl}/modelo`, formData);
  }

  baixarModelo(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/modelo`, { responseType: "blob" });
  }

  obter(matriculaId: string): Observable<ContratoMatricula | null> {
    return this.http.get<ContratoMatricula | null>(`${this.baseUrl}/matriculas/${matriculaId}`);
  }

  /** Contrato preenchido, sem enviar; o header X-Campos-Desconhecidos lista campos sem valor. */
  previa(matriculaId: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.baseUrl}/matriculas/${matriculaId}/previa`, {
      responseType: "blob",
      observe: "response",
    });
  }

  enviar(matriculaId: string): Observable<ContratoMatricula> {
    return this.http.post<ContratoMatricula>(
      `${this.baseUrl}/matriculas/${matriculaId}/enviar`,
      {},
    );
  }

  cancelar(matriculaId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/matriculas/${matriculaId}/cancelar`, {});
  }

  /** Busca na Clicksign o PDF assinado (usado quando o webhook não chegou). */
  sincronizar(matriculaId: string): Observable<ContratoMatricula> {
    return this.http.post<ContratoMatricula>(
      `${this.baseUrl}/matriculas/${matriculaId}/sincronizar`,
      {},
    );
  }

  arquivo(matriculaId: string, tipo: "gerado" | "assinado", inline = false): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/matriculas/${matriculaId}/arquivo`, {
      params: { tipo, ...(inline ? { inline: "1" } : {}) },
      responseType: "blob",
    });
  }
}
