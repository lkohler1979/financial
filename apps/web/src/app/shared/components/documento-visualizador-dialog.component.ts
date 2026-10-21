import { Component, inject, OnDestroy, OnInit, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { DocumentosService } from "../../core/services/documentos.service";
import { salvarBlobComoArquivo } from "../utils/download.util";

export interface DocumentoParaVisualizar {
  id: string;
  nome: string;
  mime?: string | null;
}

/**
 * Visualiza um documento (PDF ou imagem) na própria tela, com a opção de baixar. O arquivo vem
 * pelo HttpClient (com o token de login) e é mostrado a partir de um blob local — um link direto
 * para a API não funcionaria, porque o navegador não envia o header de autenticação.
 */
@Component({
  selector: "app-documento-visualizador-dialog",
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title class="!pr-4 break-all">{{ documento.nome }}</h2>
    <mat-dialog-content class="!p-0 !max-h-[75vh]">
      @if (carregando()) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }
      @if (erro(); as mensagem) {
        <p class="p-4 text-sm text-red-700 m-0">{{ mensagem }}</p>
      }
      @if (url(); as fonte) {
        @switch (tipo()) {
          @case ("pdf") {
            <iframe
              [src]="fonte"
              title="Documento"
              class="w-full border-0"
              style="height: 72vh"
            ></iframe>
          }
          @case ("imagem") {
            <img [src]="fonte" [alt]="documento.nome" class="block max-w-full mx-auto" />
          }
          @default {
            <p class="p-4 text-sm text-gray-600 m-0">
              Este tipo de arquivo não pode ser exibido na tela. Use o botão Baixar.
            </p>
          }
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Fechar</button>
      <button mat-flat-button color="primary" type="button" [disabled]="!blob" (click)="baixar()">
        <mat-icon>download</mat-icon> Baixar
      </button>
    </mat-dialog-actions>
  `,
})
export class DocumentoVisualizadorDialogComponent implements OnInit, OnDestroy {
  private readonly service = inject(DocumentosService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly documento = inject<DocumentoParaVisualizar>(MAT_DIALOG_DATA);

  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly url = signal<SafeResourceUrl | null>(null);
  readonly tipo = signal<"pdf" | "imagem" | "outro">("outro");
  blob: Blob | null = null;
  private urlBruta: string | null = null;

  ngOnInit(): void {
    this.service.visualizar(this.documento.id).subscribe({
      next: (blob) => {
        this.blob = blob;
        this.tipo.set(this.detectarTipo(blob));
        this.urlBruta = URL.createObjectURL(blob);
        this.url.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.urlBruta));
        this.carregando.set(false);
      },
      error: () => {
        this.carregando.set(false);
        this.erro.set("Não foi possível abrir o arquivo. Ele pode ter sido removido do servidor.");
      },
    });
  }

  ngOnDestroy(): void {
    if (this.urlBruta) URL.revokeObjectURL(this.urlBruta);
  }

  baixar(): void {
    if (this.blob) salvarBlobComoArquivo(this.blob, this.documento.nome);
  }

  /** Pelo tipo do arquivo (resposta ou cadastro) e, se não bastar, pela extensão do nome. */
  private detectarTipo(blob: Blob): "pdf" | "imagem" | "outro" {
    const mime = (blob.type || this.documento.mime || "").toLowerCase();
    const nome = this.documento.nome.toLowerCase();
    if (mime.includes("pdf") || nome.endsWith(".pdf")) return "pdf";
    if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/.test(nome)) return "imagem";
    return "outro";
  }
}
