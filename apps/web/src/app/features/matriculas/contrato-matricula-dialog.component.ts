import { DatePipe } from "@angular/common";
import { Component, ElementRef, inject, OnInit, signal, viewChild } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar } from "@angular/material/snack-bar";
import { renderAsync } from "docx-preview";
import {
  ContratoMatricula,
  ContratosService,
  StatusContrato,
} from "../../core/services/contratos.service";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "../../shared/components/confirm-dialog.component";
import { salvarBlobComoArquivo } from "../../shared/utils/download.util";

const STATUS: Record<StatusContrato, { texto: string; classe: string }> = {
  ENVIADO: { texto: "Aguardando assinatura", classe: "bg-amber-100 text-amber-800" },
  ASSINADO: { texto: "Assinado", classe: "bg-green-100 text-green-800" },
  RECUSADO: { texto: "Recusado", classe: "bg-red-100 text-red-800" },
  CANCELADO: { texto: "Cancelado", classe: "bg-gray-100 text-gray-700" },
};

const AUTENTICACAO = {
  EMAIL: "e-mail",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  ICP_BRASIL: "certificado digital ICP-Brasil",
};

/**
 * Contrato de prestação de serviços da matrícula: gera a partir do modelo (Configurações),
 * mostra na tela, envia para assinatura na Clicksign e acompanha a situação.
 */
@Component({
  selector: "app-contrato-matricula-dialog",
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatIconModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Contrato — {{ dados.aluno }}</h2>
    <mat-dialog-content>
      <p class="text-sm text-gray-600 mt-0">
        Matrícula {{ dados.numeroMatricula || "sem número" }}
        @if (dados.curso) {
          · {{ dados.curso }}
        }
      </p>

      @if (ocupado()) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }

      @if (contrato(); as c) {
        <div class="border rounded p-3 mb-3 text-sm">
          <span class="px-2 py-0.5 rounded text-xs" [class]="status(c).classe">
            {{ status(c).texto }}
          </span>
          <span class="ml-2">
            Contratante: <strong>{{ c.contratanteNome }}</strong> ({{ c.contratanteEmail }}) —
            autenticação por {{ autenticacao(c) }} ·
            {{ c.provedor === "AUTENTIQUE" ? "Autentique" : "Clicksign" }}
          </span>
          <div class="text-xs text-gray-500 mt-1">
            Enviado em {{ c.enviadoEm | date: "dd/MM/yyyy HH:mm" }}
            @if (c.assinadoEm) {
              · assinado em {{ c.assinadoEm | date: "dd/MM/yyyy HH:mm" }}
            }
          </div>
          @if (c.status === "ASSINADO" && !c.arquivoAssinadoChave) {
            <div class="text-xs text-amber-700 mt-1">
              O arquivo assinado ainda não chegou da plataforma de assinatura. Use "Atualizar
              situação".
            </div>
          }
        </div>
      } @else if (!carregando()) {
        <p class="text-sm text-gray-500">Nenhum contrato foi enviado para esta matrícula.</p>
      }

      @if (desconhecidos().length) {
        <p class="text-sm text-amber-700">
          Campos do modelo sem correspondência (ficaram como estão):
          {{ desconhecidos().join(", ") }}
        </p>
      }
      @if (erro(); as mensagem) {
        <p class="text-sm text-red-700">{{ mensagem }}</p>
      }

      <div
        #previa
        class="border rounded bg-gray-100 overflow-auto"
        [class.hidden]="!previaGerada()"
        style="max-height: 55vh"
      ></div>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!flex-wrap gap-1">
      <button mat-button mat-dialog-close>Fechar</button>
      @if (contrato()?.status === "ENVIADO") {
        <button mat-stroked-button type="button" [disabled]="ocupado()" (click)="atualizar()">
          <mat-icon>sync</mat-icon> Atualizar situação
        </button>
        <button
          mat-stroked-button
          color="warn"
          type="button"
          [disabled]="ocupado()"
          (click)="cancelar()"
        >
          Cancelar envio
        </button>
      }
      @if (contrato()?.status === "ASSINADO") {
        <button mat-stroked-button type="button" [disabled]="ocupado()" (click)="atualizar()">
          <mat-icon>sync</mat-icon> Atualizar situação
        </button>
        @if (contrato()?.arquivoAssinadoChave) {
          <button mat-stroked-button type="button" (click)="baixarAssinado()">
            <mat-icon>verified</mat-icon> Baixar assinado
          </button>
        }
      }
      @if (previaGerada()) {
        <button mat-stroked-button type="button" (click)="baixarPrevia()">
          <mat-icon>download</mat-icon> Baixar Word
        </button>
      }
      <button mat-stroked-button type="button" [disabled]="ocupado()" (click)="gerarPrevia()">
        <mat-icon>visibility</mat-icon> Gerar e visualizar
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="ocupado() || contrato()?.status === 'ENVIADO'"
        (click)="enviar()"
      >
        <mat-icon>draw</mat-icon> Enviar para assinatura
      </button>
    </mat-dialog-actions>
  `,
})
export class ContratoMatriculaDialogComponent implements OnInit {
  private readonly service = inject(ContratosService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  readonly dados = inject<{
    matriculaId: string;
    aluno: string;
    numeroMatricula: string | null;
    curso: string | null;
  }>(MAT_DIALOG_DATA);

  private readonly areaPrevia = viewChild.required<ElementRef<HTMLElement>>("previa");

  readonly contrato = signal<ContratoMatricula | null>(null);
  readonly carregando = signal(true);
  readonly ocupado = signal(false);
  readonly erro = signal<string | null>(null);
  readonly previaGerada = signal(false);
  readonly desconhecidos = signal<string[]>([]);
  private blobPrevia: Blob | null = null;

  ngOnInit(): void {
    this.carregar();
  }

  status(c: ContratoMatricula) {
    return STATUS[c.status];
  }

  autenticacao(c: ContratoMatricula): string {
    return AUTENTICACAO[c.autenticacao];
  }

  private carregar(): void {
    this.service.obter(this.dados.matriculaId).subscribe({
      next: (c) => {
        this.contrato.set(c);
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
  }

  /** O backend devolve a mensagem de erro em `error.error.mensagem`; senão, texto genérico. */
  private falhou(padrao: string) {
    return (e: { error?: { mensagem?: string; message?: string } }) => {
      this.ocupado.set(false);
      this.erro.set(e.error?.mensagem ?? e.error?.message ?? padrao);
    };
  }

  gerarPrevia(): void {
    this.erro.set(null);
    this.ocupado.set(true);
    this.service.previa(this.dados.matriculaId).subscribe({
      next: async (resposta) => {
        const blob = resposta.body as Blob;
        this.blobPrevia = blob;
        const lista = decodeURIComponent(resposta.headers.get("X-Campos-Desconhecidos") ?? "");
        this.desconhecidos.set(lista ? lista.split(",") : []);
        const area = this.areaPrevia().nativeElement;
        area.innerHTML = "";
        try {
          await renderAsync(blob, area, undefined, { inWrapper: false, ignoreWidth: false });
          this.previaGerada.set(true);
        } catch {
          this.erro.set("Não foi possível exibir o contrato na tela. Use 'Baixar Word'.");
          this.previaGerada.set(false);
        }
        this.ocupado.set(false);
      },
      error: async (e) => {
        this.ocupado.set(false);
        // Erros chegam como blob (responseType: blob): lê o texto para mostrar a mensagem.
        const texto = e.error instanceof Blob ? await e.error.text() : "";
        let mensagem = "Não foi possível gerar o contrato.";
        try {
          mensagem = JSON.parse(texto).mensagem ?? mensagem;
        } catch {
          /* mantém a mensagem padrão */
        }
        this.erro.set(mensagem);
      },
    });
  }

  baixarPrevia(): void {
    if (this.blobPrevia) {
      salvarBlobComoArquivo(this.blobPrevia, `Contrato ${this.dados.aluno}.docx`);
    }
  }

  enviar(): void {
    const dados: ConfirmDialogData = {
      titulo: "Enviar para assinatura",
      mensagem:
        "O contrato será gerado com os dados atuais da matrícula e enviado por e-mail ao contratante para assinatura eletrônica. Confirmar?",
      confirmarTexto: "Enviar",
    };
    this.dialog
      .open(ConfirmDialogComponent, { data: dados })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.erro.set(null);
        this.ocupado.set(true);
        this.service.enviar(this.dados.matriculaId).subscribe({
          next: (c) => {
            this.contrato.set(c);
            this.ocupado.set(false);
            this.snackBar.open("Contrato enviado para assinatura", "Fechar", { duration: 4000 });
          },
          error: this.falhou("Não foi possível enviar o contrato."),
        });
      });
  }

  atualizar(): void {
    this.erro.set(null);
    this.ocupado.set(true);
    this.service.sincronizar(this.dados.matriculaId).subscribe({
      next: (c) => {
        this.contrato.set(c);
        this.ocupado.set(false);
      },
      error: this.falhou("Não foi possível consultar a plataforma de assinatura."),
    });
  }

  cancelar(): void {
    const dados: ConfirmDialogData = {
      titulo: "Cancelar envio",
      mensagem: "O contrato deixa de poder ser assinado. Cancelar o envio?",
      confirmarTexto: "Cancelar envio",
    };
    this.dialog
      .open(ConfirmDialogComponent, { data: dados })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.ocupado.set(true);
        this.service.cancelar(this.dados.matriculaId).subscribe({
          next: () => {
            this.ocupado.set(false);
            this.carregar();
          },
          error: this.falhou("Não foi possível cancelar."),
        });
      });
  }

  baixarAssinado(): void {
    this.service
      .arquivo(this.dados.matriculaId, "assinado")
      .subscribe((blob) =>
        salvarBlobComoArquivo(blob, `Contrato assinado ${this.dados.aluno}.pdf`),
      );
  }
}
