import { DatePipe } from "@angular/common";
import { Component, inject, Input, OnChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import {
  Documento,
  DocumentosDaMatricula,
  ItemDocumento,
  SituacaoDeferimentoDocumento,
  SituacaoEntregaDocumento,
} from "../../core/models/documento.model";
import { DocumentosService } from "../../core/services/documentos.service";
import { salvarBlobComoArquivo } from "../../shared/utils/download.util";

/** Valores editáveis de um documento enquanto o usuário mexe (só vão pro
 * servidor ao clicar em "Salvar"). */
interface Edicao {
  situacaoEntrega: SituacaoEntregaDocumento;
  situacaoDeferimento: SituacaoDeferimentoDocumento;
  vencimento: string;
  observacaoInterna: string;
  observacaoAluno: string;
}

/**
 * Documentos da matrícula: um bloco por tipo (CPF, RG, Contrato...) com as
 * duas situações pedidas — ENTREGA (enviado ou não) e DEFERIMENTO
 * (conferência: pendente/deferido/indeferido). Deferir exige a permissão
 * "pode deferir documentos" (ou ser administrador); o backend também confere.
 */
@Component({
  selector: "app-documentos-matricula",
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  template: `
    <div class="border-t pt-4 mt-4">
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs font-medium text-gray-600 m-0">DOCUMENTOS</p>
        @if (dados) {
          @if (dados.pendentesObrigatorios > 0) {
            <span class="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700">
              {{ dados.pendentesObrigatorios }} obrigatório(s) pendente(s)
            </span>
          } @else {
            <span class="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
              Documentação completa
            </span>
          }
        }
      </div>

      @if (carregando) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }

      @for (item of dados?.itens ?? []; track item.tipo.id) {
        <div class="border rounded-lg p-3 mb-3">
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <span class="font-medium">{{ item.tipo.nome }}</span>
            @if (item.tipo.obrigatorio) {
              <span class="text-xs text-gray-400">obrigatório</span>
            }
            <span class="text-xs text-gray-400">
              ({{ item.tipo.escopo === "ALUNO" ? "do aluno" : "da matrícula" }})
            </span>
            <span class="flex-1"></span>
            <span class="px-2 py-0.5 rounded text-xs" [class]="classeEntrega(item)">
              {{ item.documento?.situacaoEntrega === "ENVIADO" ? "Enviado" : "Não enviado" }}
            </span>
            <span class="px-2 py-0.5 rounded text-xs" [class]="classeDeferimento(item)">
              {{ rotuloDeferimento(item) }}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2 mb-2">
            <input
              #arquivo
              type="file"
              class="hidden"
              accept=".pdf,.jpg,.jpeg,.png"
              (change)="anexar(item, arquivo)"
            />
            <button mat-stroked-button type="button" [disabled]="enviando === item.tipo.id" (click)="arquivo.click()">
              <mat-icon>upload_file</mat-icon>
              {{ item.documento?.arquivoNome ? "Trocar arquivo" : "Anexar arquivo" }}
            </button>
            @if (item.documento?.arquivoNome) {
              <button mat-button type="button" (click)="baixar(item.documento!)">
                <mat-icon>download</mat-icon> {{ item.documento!.arquivoNome }}
              </button>
              <button mat-icon-button type="button" aria-label="Remover arquivo" (click)="remover(item.documento!)">
                <mat-icon>delete</mat-icon>
              </button>
            }
            @if (item.documento?.anexadoEm) {
              <span class="text-xs text-gray-500">
                Anexado {{ item.documento!.anexadoPorAluno ? "pelo aluno " : "" }}em
                {{ item.documento!.anexadoEm | date: "dd/MM/yyyy HH:mm:ss" }}
                @if (item.documento!.anexadoIp) { · IP {{ item.documento!.anexadoIp }} }
              </span>
            }
            @if (item.documento?.deferidoEm) {
              <span class="text-xs text-gray-500">
                · {{ item.documento!.situacaoDeferimento === "DEFERIDO" ? "Deferido" : "Indeferido" }}
                em {{ item.documento!.deferidoEm | date: "dd/MM/yyyy HH:mm" }}
                @if (item.documento!.validadoPor) {
                  por {{ item.documento!.validadoPor!.nome }}
                }
              </span>
            }
          </div>

          @if (edicoes[item.tipo.id]; as e) {
            <div class="grid grid-cols-1 md:grid-cols-3 gap-x-3">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Situação da entrega</mat-label>
                <mat-select [(ngModel)]="e.situacaoEntrega">
                  <mat-option value="NAO_ENVIADO">Não enviado</mat-option>
                  <mat-option value="ENVIADO">Enviado</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Situação do deferimento</mat-label>
                <mat-select [(ngModel)]="e.situacaoDeferimento" [disabled]="!dados?.podeDeferir">
                  <mat-option value="PENDENTE">Pendente</mat-option>
                  <mat-option value="DEFERIDO">Deferido</mat-option>
                  <mat-option value="INDEFERIDO">Indeferido</mat-option>
                </mat-select>
                @if (!dados?.podeDeferir) {
                  <mat-hint>Sem permissão para deferir</mat-hint>
                }
              </mat-form-field>

              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Vencimento</mat-label>
                <input matInput type="date" [(ngModel)]="e.vencimento" />
              </mat-form-field>

              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="md:col-span-3 mt-2">
                <mat-label>Observação interna</mat-label>
                <textarea matInput rows="2" [(ngModel)]="e.observacaoInterna"></textarea>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="md:col-span-3 mt-2">
                <mat-label>Observação para o aluno</mat-label>
                <textarea matInput rows="2" [(ngModel)]="e.observacaoAluno"></textarea>
              </mat-form-field>
              <div class="md:col-span-3 flex justify-end mt-2">
                <button
                  mat-raised-button
                  color="primary"
                  type="button"
                  [disabled]="salvando === item.tipo.id"
                  (click)="salvar(item)"
                >
                  Salvar documento
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class DocumentosMatriculaComponent implements OnChanges {
  private readonly service = inject(DocumentosService);
  private readonly snackBar = inject(MatSnackBar);

  @Input({ required: true }) matriculaId!: string;

  dados?: DocumentosDaMatricula;
  edicoes: Record<string, Edicao> = {};
  carregando = false;
  enviando?: string;
  salvando?: string;

  ngOnChanges(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.service.listarDaMatricula(this.matriculaId).subscribe({
      next: (dados) => {
        this.dados = dados;
        this.edicoes = {};
        for (const item of dados.itens) {
          this.edicoes[item.tipo.id] = {
            situacaoEntrega: item.documento?.situacaoEntrega ?? "NAO_ENVIADO",
            situacaoDeferimento: item.documento?.situacaoDeferimento ?? "PENDENTE",
            vencimento: item.documento?.vencimento?.substring(0, 10) ?? "",
            observacaoInterna: item.documento?.observacaoInterna ?? "",
            observacaoAluno: item.documento?.observacaoAluno ?? "",
          };
        }
        this.carregando = false;
      },
      error: () => (this.carregando = false),
    });
  }

  classeEntrega(item: ItemDocumento): string {
    return item.documento?.situacaoEntrega === "ENVIADO"
      ? "bg-blue-100 text-blue-700"
      : "bg-gray-100 text-gray-500";
  }

  classeDeferimento(item: ItemDocumento): string {
    switch (item.documento?.situacaoDeferimento) {
      case "DEFERIDO":
        return "bg-green-100 text-green-700";
      case "INDEFERIDO":
        return "bg-red-100 text-red-700";
      default:
        return "bg-amber-100 text-amber-700";
    }
  }

  rotuloDeferimento(item: ItemDocumento): string {
    switch (item.documento?.situacaoDeferimento) {
      case "DEFERIDO":
        return "Deferido";
      case "INDEFERIDO":
        return "Indeferido";
      default:
        return "Pendente";
    }
  }

  anexar(item: ItemDocumento, input: HTMLInputElement): void {
    const arquivo = input.files?.[0];
    if (!arquivo) return;
    this.enviando = item.tipo.id;
    this.service.anexar(this.matriculaId, item.tipo.id, arquivo).subscribe({
      next: () => {
        this.enviando = undefined;
        input.value = "";
        this.snackBar.open("Arquivo anexado", "Fechar", { duration: 3000 });
        this.carregar();
      },
      error: (erro) => {
        this.enviando = undefined;
        input.value = "";
        this.snackBar.open(erro?.error?.mensagem ?? "Não foi possível anexar", "Fechar", {
          duration: 5000,
        });
      },
    });
  }

  baixar(documento: Documento): void {
    this.service.baixar(documento.id).subscribe((blob) => {
      salvarBlobComoArquivo(blob, documento.arquivoNome ?? "documento");
    });
  }

  remover(documento: Documento): void {
    if (!window.confirm("Remover o arquivo anexado? O documento volta para \"não enviado\".")) return;
    this.service.removerArquivo(documento.id).subscribe(() => this.carregar());
  }

  salvar(item: ItemDocumento): void {
    const e = this.edicoes[item.tipo.id];
    const atual = item.documento;
    // Só manda o que mudou — assim quem não pode deferir não esbarra no 403
    // ao editar apenas observações/vencimento.
    const payload: Record<string, unknown> = {};
    if (e.situacaoEntrega !== (atual?.situacaoEntrega ?? "NAO_ENVIADO")) {
      payload["situacaoEntrega"] = e.situacaoEntrega;
    }
    if (e.situacaoDeferimento !== (atual?.situacaoDeferimento ?? "PENDENTE")) {
      payload["situacaoDeferimento"] = e.situacaoDeferimento;
    }
    if (e.vencimento !== (atual?.vencimento?.substring(0, 10) ?? "")) {
      payload["vencimento"] = e.vencimento || null;
    }
    if (e.observacaoInterna !== (atual?.observacaoInterna ?? "")) {
      payload["observacaoInterna"] = e.observacaoInterna || null;
    }
    if (e.observacaoAluno !== (atual?.observacaoAluno ?? "")) {
      payload["observacaoAluno"] = e.observacaoAluno || null;
    }
    if (Object.keys(payload).length === 0) {
      this.snackBar.open("Nada para salvar", "Fechar", { duration: 2000 });
      return;
    }

    this.salvando = item.tipo.id;
    this.service.atualizar(this.matriculaId, item.tipo.id, payload).subscribe({
      next: () => {
        this.salvando = undefined;
        this.snackBar.open("Documento atualizado", "Fechar", { duration: 3000 });
        this.carregar();
      },
      error: (erro) => {
        this.salvando = undefined;
        this.snackBar.open(erro?.error?.mensagem ?? "Não foi possível salvar", "Fechar", {
          duration: 5000,
        });
      },
    });
  }
}
