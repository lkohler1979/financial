import { Component, inject, OnDestroy, OnInit } from "@angular/core";
import { CurrencyPipe, DatePipe, Location, NgClass } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatChipsModule } from "@angular/material/chips";
import { MatSelectModule } from "@angular/material/select";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatMenuModule } from "@angular/material/menu";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Subscription, interval, switchMap, takeWhile } from "rxjs";
import { CobrancaService } from "../../core/services/cobranca.service";
import { ConfiguracoesService } from "../../core/services/configuracoes.service";
import { FinanceiroService } from "../../core/services/financeiro.service";
import { RelatoriosService } from "../../core/services/relatorios.service";
import { FichaCobranca, SituacaoCobranca, Tag } from "../../core/models/cobranca.model";
import { Parcela } from "../../core/models/parcela.model";
import { formatarCpf } from "../../shared/utils/cpf.util";

@Component({
  selector: "app-ficha-cobranca",
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    NgClass,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatProgressBarModule,
  ],
  template: `
    @if (carregando) {
      <mat-progress-bar mode="indeterminate" class="mb-4"></mat-progress-bar>
    }

    @if (ficha) {
      <button mat-button class="!px-2 !mb-2 !-ml-2" (click)="voltar()">
        <mat-icon>arrow_back</mat-icon> Voltar
      </button>

      <div class="flex items-start justify-between mb-5">
        <div>
          <h1 class="text-2xl font-medium m-0">{{ ficha.matricula.aluno?.nome }}</h1>
          <p class="text-sm text-gray-500 mt-1">
            CPF {{ formatarCpf(ficha.matricula.aluno?.cpf || "") }} ·
            {{ ficha.matricula.curso?.nome }}
            @if (ficha.matricula.numeroMatricula) {
              · matrícula {{ ficha.matricula.numeroMatricula }}
            }
          </p>
        </div>
        <div class="flex gap-2">
          <button mat-stroked-button [disabled]="gerando" (click)="gerarDocumento()">
            <mat-icon>description</mat-icon> Gerar documento
          </button>
          @if (ultimoRelatorioGeradoId) {
            <button mat-stroked-button [matMenuTriggerFor]="menuUltimoDocumento">
              <mat-icon>download</mat-icon> Baixar
            </button>
            <mat-menu #menuUltimoDocumento="matMenu">
              <button mat-menu-item (click)="baixarUltimoDocumento('docx')">Word (.docx)</button>
              <button mat-menu-item (click)="baixarUltimoDocumento('pdf')">PDF</button>
            </mat-menu>
          }
          <a mat-stroked-button [routerLink]="['/matriculas', ficha.matricula.id]">
            <mat-icon>edit</mat-icon> Editar matrícula
          </a>
        </div>
      </div>

      @if (gerando) {
        <mat-progress-bar mode="indeterminate" class="mb-4"></mat-progress-bar>
      }

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <div class="bg-white rounded-xl border p-5">
          <p class="text-xs font-medium text-gray-600 mb-2">Situação da cobrança</p>
          <mat-form-field appearance="outline" class="w-full">
            <mat-select [formControl]="situacaoControl" (selectionChange)="mudarSituacao($event.value)">
              @for (situacao of situacoes; track situacao.id) {
                <mat-option [value]="situacao.id">{{ situacao.nome }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <p class="text-xs font-medium text-gray-600 mb-2 mt-3">Tags</p>
          <div class="flex gap-2 flex-wrap items-center">
            <mat-chip-set>
              @for (tag of ficha.tags; track tag.id) {
                <mat-chip [removable]="true" (removed)="removerTag(tag)">
                  {{ tag.nome }}
                  <mat-icon matChipRemove aria-label="Remover tag">cancel</mat-icon>
                </mat-chip>
              }
            </mat-chip-set>
            <mat-form-field appearance="outline" class="!w-40 !text-xs" subscriptSizing="dynamic">
              <mat-select placeholder="+ Adicionar" (selectionChange)="adicionarTag($event.value)">
                @for (tag of tagsDisponiveis(); track tag.id) {
                  <mat-option [value]="tag.id">{{ tag.nome }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
        </div>

        <div class="bg-white rounded-xl border p-5">
          <p class="text-xs font-medium text-gray-600 mb-3">Parcelas</p>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-gray-400">
                <th class="py-1 font-medium">Parcela</th>
                <th class="py-1 font-medium">Título</th>
                <th class="py-1 font-medium">Vencimento</th>
                <th class="py-1 font-medium">Tipo de título</th>
                <th class="py-1 font-medium">Situação</th>
                <th class="py-1 font-medium text-right">Valor</th>
                <th
                  class="py-1 font-medium text-right"
                  title="Valor com juros e multa já calculado pelo sistema de origem da planilha — só para conferência, não é usado no cálculo do sistema"
                >
                  Valor c/ juros (origem)
                </th>
              </tr>
            </thead>
            @for (parcela of parcelas; track parcela.id) {
              <tr class="text-gray-600">
                <td class="py-1">{{ parcela.parcela }}</td>
                <td class="py-1">{{ parcela.codTitulo }}</td>
                <td class="py-1">{{ parcela.vencimento | date: "dd/MM/yyyy" }}</td>
                <td class="py-1">{{ parcela.tipoTitulo || "—" }}</td>
                <td class="py-1">
                  <span
                    class="px-2 py-0.5 rounded text-xs"
                    [ngClass]="situacaoParcela(parcela).classe"
                    >{{ situacaoParcela(parcela).rotulo }}</span
                  >
                </td>
                <td class="py-1 text-right">{{ parcela.valor | currency: "BRL" }}</td>
                <td class="py-1 text-right text-gray-400">
                  {{
                    parcela.valorOrigemComJurosEMulta !== undefined &&
                    parcela.valorOrigemComJurosEMulta !== null
                      ? (parcela.valorOrigemComJurosEMulta | currency: "BRL")
                      : "—"
                  }}
                </td>
              </tr>
            }
            @if (parcelas.length === 0) {
              <tr>
                <td class="text-gray-400 py-2">Nenhuma parcela cadastrada.</td>
              </tr>
            }
            @if (parcelas.length > 0) {
              <tr class="border-t font-medium">
                <td class="py-1" colspan="5">Total devedor</td>
                <td class="py-1 text-right">{{ totalDevedor() | currency: "BRL" }}</td>
                <td class="py-1"></td>
              </tr>
            }
          </table>
        </div>
      </div>

      <div class="bg-white rounded-xl border p-5 mb-5">
        <p class="text-xs font-medium text-gray-600 mb-3">Nova observação</p>
        <div class="flex gap-2">
          <mat-form-field appearance="outline" class="flex-1" subscriptSizing="dynamic">
            <input
              matInput
              [formControl]="novaObservacao"
              placeholder="Ligação realizada, cliente informou..."
              (keydown.enter)="adicionarObservacao()"
            />
          </mat-form-field>
          <button mat-stroked-button (click)="adicionarObservacao()">Adicionar</button>
        </div>
      </div>

      <div>
        <p class="text-xs font-medium text-gray-600 mb-3">Histórico</p>
        <div class="flex flex-col gap-3">
          @for (item of ficha.historico; track item.id) {
            <div class="flex gap-3">
              <div class="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 flex-shrink-0"></div>
              <div>
                <p class="text-sm m-0">{{ item.acao }}</p>
                <p class="text-xs text-gray-400 mt-0.5 mb-0">
                  {{ item.data | date: "dd/MM" }} · {{ item.usuario?.nome }}
                </p>
              </div>
            </div>
          }
          @if (ficha.historico.length === 0) {
            <p class="text-gray-400 text-sm">Nenhum evento registrado ainda.</p>
          }
        </div>
      </div>
    }
  `,
})
export class FichaCobrancaComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly service = inject(CobrancaService);
  private readonly configuracoesService = inject(ConfiguracoesService);
  private readonly financeiroService = inject(FinanceiroService);
  private readonly relatoriosService = inject(RelatoriosService);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly formatarCpf = formatarCpf;

  matriculaId = "";
  ficha?: FichaCobranca;
  situacoes: SituacaoCobranca[] = [];
  todasTags: Tag[] = [];
  parcelas: Parcela[] = [];
  carregando = false;
  gerando = false;
  /** Configuracao.diasAtraso — limiar para "vencida" vs. "vencida há mais de N dias". */
  diasAtrasoMinimo = 0;
  /** Relatório da última geração de documento nesta sessão — habilita o menu
   * de download (Word/PDF) sem precisar abrir o histórico de relatórios. */
  ultimoRelatorioGeradoId?: string;

  private pollingSub?: Subscription;

  readonly situacaoControl = new FormControl<string | undefined>(undefined);
  readonly novaObservacao = new FormControl("", { nonNullable: true });

  ngOnInit(): void {
    this.matriculaId = this.route.snapshot.paramMap.get("matriculaId") ?? "";
    this.service.listarSituacoes(true).subscribe((res) => (this.situacoes = res));
    this.service.listarTags().subscribe((res) => (this.todasTags = res));
    this.configuracoesService.obter().subscribe((res) => (this.diasAtrasoMinimo = res.diasAtraso));
    this.carregar();
  }

  ngOnDestroy(): void {
    this.pollingSub?.unsubscribe();
  }

  carregar(): void {
    this.carregando = true;
    this.service.obterFicha(this.matriculaId).subscribe({
      next: (ficha) => {
        this.ficha = ficha;
        this.situacaoControl.setValue(ficha.matricula.situacaoCobrancaId ?? undefined, {
          emitEvent: false,
        });
        this.carregando = false;
      },
      error: () => (this.carregando = false),
    });

    this.financeiroService
      .listar({ matriculaId: this.matriculaId, pageSize: 100 })
      .subscribe((res) => (this.parcelas = res.data));
  }

  voltar(): void {
    this.location.back();
  }

  tagsDisponiveis(): Tag[] {
    const idsAtuais = new Set((this.ficha?.tags ?? []).map((t) => t.id));
    return this.todasTags.filter((t) => !idsAtuais.has(t.id));
  }

  /**
   * Situação exibida da parcela (PRD): deriva de status + vencimento, já que
   * "vencida" não é um StatusParcela — é calculada a partir da data.
   */
  situacaoParcela(parcela: Parcela): { rotulo: string; classe: string } {
    if (parcela.status === "PROTESTADO") {
      return { rotulo: "Vencida e enviada para protesto", classe: "bg-red-100 text-red-800" };
    }
    if (parcela.status === "PAGO") {
      return { rotulo: "Paga", classe: "bg-green-100 text-green-700" };
    }
    if (parcela.status === "CANCELADO") {
      return { rotulo: "Cancelada", classe: "bg-gray-100 text-gray-500" };
    }
    if (parcela.status === "RENEGOCIADO") {
      return { rotulo: "Renegociada", classe: "bg-blue-100 text-blue-700" };
    }
    const hoje = new Date();
    const vencimento = new Date(parcela.vencimento);
    if (vencimento >= hoje) {
      return { rotulo: "A vencer", classe: "bg-gray-100 text-gray-600" };
    }

    if (this.diasAtrasoMinimo > 0) {
      const diasAtraso = Math.floor((hoje.getTime() - vencimento.getTime()) / 86_400_000);
      if (diasAtraso > this.diasAtrasoMinimo) {
        return {
          rotulo: `Vencida há mais de ${this.diasAtrasoMinimo} dias`,
          classe: "bg-red-100 text-red-700",
        };
      }
    }

    return { rotulo: "Vencida", classe: "bg-orange-100 text-orange-700" };
  }

  totalDevedor(): number {
    return this.parcelas
      .filter((p) => p.status === "EM_ABERTO" || p.status === "PROTESTADO")
      .reduce((soma, p) => soma + Number(p.valor), 0);
  }

  mudarSituacao(situacaoCobrancaId: string): void {
    this.service.mudarSituacao(this.matriculaId, situacaoCobrancaId).subscribe(() => {
      this.snackBar.open("Situação atualizada", "Fechar", { duration: 3000 });
      this.carregar();
    });
  }

  adicionarTag(tagId: string): void {
    this.service.adicionarTag(this.matriculaId, tagId).subscribe(() => this.carregar());
  }

  removerTag(tag: Tag): void {
    this.service.removerTag(this.matriculaId, tag.id).subscribe(() => this.carregar());
  }

  adicionarObservacao(): void {
    const texto = this.novaObservacao.value.trim();
    if (!texto) return;

    this.service.adicionarObservacao(this.matriculaId, texto).subscribe(() => {
      this.novaObservacao.setValue("");
      this.carregar();
    });
  }

  /**
   * Gera o documento de protesto só para esta matrícula, sem passar pela tela
   * de relatório em lote. Usa o mínimo de dias configurado no sistema (não
   * força 0) — decisão do usuário, 2026-07-07: só parcela vencida há mais
   * desse mínimo vai para protesto; parcela "só vencida" fica de fora aqui
   * (a opção de incluí-la também existe apenas na geração em lote de
   * /relatorios).
   */
  gerarDocumento(): void {
    this.gerando = true;
    this.relatoriosService.gerar({}, [this.matriculaId]).subscribe({
      next: ({ id: relatorioId, jobId, totalElegiveis }) => {
        if (totalElegiveis === 0) {
          // Nenhuma parcela elegível — normalmente porque já foram todas
          // protestadas antes. Em vez de só avisar que não há nada a gerar,
          // procura o último documento já gerado para esta matrícula e
          // oferece para baixar de novo.
          this.buscarDocumentoJaGerado();
          return;
        }

        if (jobId) this.acompanharGeracao(jobId, relatorioId);
        else this.gerando = false;
      },
      error: () => (this.gerando = false),
    });
  }

  private buscarDocumentoJaGerado(): void {
    this.relatoriosService.buscarUltimoDocumentoDaMatricula(this.matriculaId).subscribe((doc) => {
      this.gerando = false;

      if (!doc) {
        this.snackBar.open(
          "Esta matrícula não tem parcelas vencidas em aberto para gerar documento",
          "Fechar",
          { duration: 5000 },
        );
        return;
      }

      this.ultimoRelatorioGeradoId = doc.relatorioId;
      const formatoPadrao = doc.temDocx ? "docx" : "pdf";
      this.snackBar
        .open("Documento já havia sido gerado — use o botão Baixar para pegar de novo", "Baixar", {
          duration: 7000,
        })
        .onAction()
        .subscribe(() => this.baixarUltimoDocumento(formatoPadrao));
    });
  }

  private acompanharGeracao(jobId: string, relatorioId: string): void {
    this.pollingSub?.unsubscribe();
    this.pollingSub = interval(1500)
      .pipe(
        switchMap(() => this.relatoriosService.statusJob(jobId)),
        takeWhile((status) => status.estado !== "completed" && status.estado !== "failed", true),
      )
      .subscribe({
        next: (status) => {
          if (status.estado === "completed") {
            this.gerando = false;
            this.finalizarGeracao(relatorioId);
          }

          if (status.estado === "failed") {
            this.gerando = false;
            this.snackBar.open(
              `Falha ao gerar documento: ${status.erro ?? "erro desconhecido"}`,
              "Fechar",
              { duration: 6000 },
            );
          }
        },
        error: () => (this.gerando = false),
      });
  }

  private finalizarGeracao(relatorioId: string): void {
    this.relatoriosService.buscarPorId(relatorioId).subscribe((relatorio) => {
      const item = (relatorio.itens ?? []).find((i) => i.matriculaId === this.matriculaId);

      if (!item?.documentoGerado) {
        this.snackBar.open("Não foi possível gerar o documento desta matrícula", "Fechar", {
          duration: 5000,
        });
        return;
      }

      this.ultimoRelatorioGeradoId = relatorioId;

      this.snackBar
        .open("Documento gerado com sucesso", "Baixar Word", { duration: 6000 })
        .onAction()
        .subscribe(() => this.baixarUltimoDocumento("docx"));

      // A geração pode ter mudado a situação de cobrança automaticamente
      // (worker: "Enviado para Protesto") e o status das parcelas envolvidas.
      this.carregar();
    });
  }

  baixarUltimoDocumento(formato: "docx" | "pdf"): void {
    if (!this.ultimoRelatorioGeradoId) return;
    window.open(
      this.relatoriosService.urlDownload(this.ultimoRelatorioGeradoId, this.matriculaId, formato),
      "_blank",
    );
  }
}
