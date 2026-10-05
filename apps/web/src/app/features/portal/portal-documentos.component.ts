import { Component, inject, input, OnInit, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBar } from "@angular/material/snack-bar";
import { PortalDocumentos, PortalItemDocumento, PortalMatricula } from "../../core/models/portal.model";
import { PortalService } from "../../core/services/portal.service";
import { baixarBlob } from "./baixar-arquivo";

/** Envio dos documentos pelo aluno + acompanhamento da conferência. */
@Component({
  selector: "app-portal-documentos",
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (matriculas().length > 1) {
      <label class="text-sm text-gray-600 mr-2" for="mat-doc">Matrícula</label>
      <select
        id="mat-doc"
        class="border rounded px-2 py-1 mb-3"
        [value]="matriculaId()"
        (change)="trocar($any($event.target).value)"
      >
        @for (m of matriculas(); track m.id) {
          <option [value]="m.id">{{ m.numeroMatricula ?? "—" }} · {{ m.curso.nome }}</option>
        }
      </select>
    }

    @if (dados(); as d) {
      @if (d.pendentesObrigatorios > 0) {
        <p class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
          {{ d.pendentesObrigatorios }} documento(s) obrigatório(s) pendente(s) de envio ou aprovação.
        </p>
      } @else {
        <p class="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">
          Toda a documentação obrigatória está aprovada.
        </p>
      }

      <div class="bg-white rounded-lg border divide-y">
        @for (item of d.itens; track item.tipo.id) {
          <div class="p-3 flex flex-wrap items-center gap-3">
            <div class="flex-1 min-w-48">
              <p class="font-medium">
                {{ item.tipo.nome }}
                @if (item.tipo.obrigatorio) {
                  <span class="text-xs text-gray-400 font-normal">obrigatório</span>
                }
              </p>
              @if (item.documento?.arquivoNome) {
                <p class="text-xs text-gray-500">{{ item.documento!.arquivoNome }}</p>
              }
              @if (item.documento?.observacaoAluno) {
                <p class="text-xs text-red-600">{{ item.documento!.observacaoAluno }}</p>
              }
            </div>

            <span class="text-xs px-2 py-1 rounded-full" [class]="classeSituacao(item)">{{ rotuloSituacao(item) }}</span>

            @if (item.documento?.situacaoEntrega === "ENVIADO") {
              <button mat-button type="button" (click)="baixar(item)">Ver arquivo</button>
            }
            @if (item.documento?.situacaoDeferimento !== "DEFERIDO") {
              <button
                mat-stroked-button
                type="button"
                [disabled]="enviando() === item.tipo.id"
                (click)="seletor.click()"
              >
                <mat-icon>upload</mat-icon>
                {{ item.documento?.situacaoEntrega === "ENVIADO" ? "Reenviar" : "Enviar" }}
              </button>
              <input
                #seletor
                type="file"
                class="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                (change)="enviar(item, $any($event.target))"
              />
            }
          </div>
        }
      </div>
      <p class="text-xs text-gray-400 mt-2">Formatos aceitos: PDF, JPG ou PNG, até 10 MB.</p>
    }
  `,
})
export class PortalDocumentosComponent implements OnInit {
  private readonly portal = inject(PortalService);
  private readonly snackBar = inject(MatSnackBar);

  readonly matriculas = input.required<PortalMatricula[]>();
  readonly matriculaId = signal("");
  readonly dados = signal<PortalDocumentos | null>(null);
  readonly enviando = signal<string | null>(null);

  ngOnInit(): void {
    this.matriculaId.set(this.matriculas()[0].id);
    this.carregar();
  }

  trocar(id: string): void {
    this.matriculaId.set(id);
    this.carregar();
  }

  private carregar(): void {
    this.portal.documentos(this.matriculaId()).subscribe((d) => this.dados.set(d));
  }

  rotuloSituacao(item: PortalItemDocumento): string {
    const doc = item.documento;
    if (!doc || doc.situacaoEntrega === "NAO_ENVIADO") return "Não enviado";
    if (doc.situacaoDeferimento === "DEFERIDO") return "Aprovado";
    if (doc.situacaoDeferimento === "INDEFERIDO") return "Recusado — reenvie";
    return "Em análise";
  }

  classeSituacao(item: PortalItemDocumento): string {
    const doc = item.documento;
    if (!doc || doc.situacaoEntrega === "NAO_ENVIADO") return "bg-gray-100 text-gray-600";
    if (doc.situacaoDeferimento === "DEFERIDO") return "bg-green-100 text-green-700";
    if (doc.situacaoDeferimento === "INDEFERIDO") return "bg-red-100 text-red-700";
    return "bg-amber-100 text-amber-700";
  }

  enviar(item: PortalItemDocumento, input: HTMLInputElement): void {
    const arquivo = input.files?.[0];
    input.value = "";
    if (!arquivo) return;
    this.enviando.set(item.tipo.id);
    this.portal.enviarDocumento(this.matriculaId(), item.tipo.id, arquivo).subscribe({
      next: () => {
        this.enviando.set(null);
        this.snackBar.open("Documento enviado — aguarde a análise", "Fechar", { duration: 4000 });
        this.carregar();
      },
      error: () => this.enviando.set(null),
    });
  }

  baixar(item: PortalItemDocumento): void {
    const doc = item.documento;
    if (!doc) return;
    this.portal.baixarDocumento(doc.id).subscribe((blob) => baixarBlob(blob, doc.arquivoNome ?? "documento"));
  }
}
