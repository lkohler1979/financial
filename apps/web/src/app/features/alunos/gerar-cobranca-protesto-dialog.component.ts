import { CurrencyPipe } from "@angular/common";
import { Component, computed, inject, OnDestroy, OnInit, signal } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import {
  catchError,
  concatMap,
  from,
  interval,
  of,
  Subscription,
  switchMap,
  takeWhile,
} from "rxjs";
import { TituloAluno } from "../../core/models/titulo-aluno.model";
import { TipoTituloProtesto } from "../../core/models/relatorio.model";
import { AsaasBillingType, AsaasService } from "../../core/services/asaas.service";
import { ConfiguracoesService } from "../../core/services/configuracoes.service";
import { RelatoriosService } from "../../core/services/relatorios.service";
import { extrairNomeArquivo, salvarBlobComoArquivo } from "../../shared/utils/download.util";
import {
  AbrangenciaCobranca,
  matriculasParaProtesto,
  OpcaoMatricula,
  titulosParaCobranca,
} from "./aluno-financeiro";

export interface DadosGerarCobrancaProtesto {
  modo: "COBRANCA" | "PROTESTO";
  /** Todos os títulos do aluno (a janela escolhe os que valem pela matrícula e pela abrangência). */
  titulos: TituloAluno[];
  /** "" = todas as matrículas do aluno. */
  matriculaId: string;
  /** Nome da matrícula/curso escolhida, para o título da janela. */
  escopo: string;
}

type FormaCobranca = "CADA" | AsaasBillingType;

const ROTULO_FORMA: Record<AsaasBillingType, string> = {
  BOLETO: "Boleto",
  PIX: "Pix",
  CREDIT_CARD: "Cartão de crédito",
};

/**
 * Gera cobrança (Asaas) ou documento de protesto para a matrícula/curso escolhida na aba Financeiro
 * do aluno, ou para todas as matrículas dele de uma vez.
 */
@Component({
  selector: "app-gerar-cobranca-protesto-dialog",
  standalone: true,
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ dados.modo === "COBRANCA" ? "Gerar cobrança" : "Gerar protesto" }}
      <span class="block text-sm font-normal text-gray-500">{{ dados.escopo }}</span>
    </h2>
    <mat-dialog-content class="!pt-2">
      @if (dados.modo === "COBRANCA") {
        <div class="grid gap-3 mb-3">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Quais títulos</mat-label>
            <mat-select [formControl]="abrangencia">
              <mat-option value="VENCIDOS">Somente os vencidos</mat-option>
              <mat-option value="TODOS">Todos os em aberto (vencidos e a vencer)</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Forma de cobrança</mat-label>
            <mat-select [formControl]="forma">
              <mat-option value="CADA">Forma definida em cada parcela</mat-option>
              @for (f of formasAceitas(); track f) {
                <mat-option [value]="f">{{ rotuloForma(f) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <p class="text-sm m-0" data-testid="resumo-cobranca">
          <strong>{{ alvoCobranca().length }}</strong> parcela(s), total
          <strong>{{ totalCobranca() | currency: "BRL" }}</strong>
        </p>
        <p class="text-xs text-gray-500 mt-1 mb-0">
          Parcelas que já têm cobrança gerada, pagas, canceladas e protestadas não entram.
          @if (forma.value === "CADA" && semForma() > 0) {
            {{ semForma() }} parcela(s) sem forma definida (ou desabilitada em Configurações) serão
            puladas.
          }
        </p>
      } @else {
        <div class="grid gap-3 mb-3">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Quais vencidos</mat-label>
            <mat-select [formControl]="abrangencia">
              <mat-option value="VENCIDOS">
                Somente os vencidos há mais de {{ diasAtraso() }} dia(s) (regra do sistema)
              </mat-option>
              <mat-option value="TODOS">
                Todos os vencidos, inclusive os recentes, juntos no mesmo documento
              </mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Gerar protesto com</mat-label>
            <mat-select [formControl]="tipoTitulo">
              <mat-option value="AMBOS">Mensalidade e Renegociação</mat-option>
              <mat-option value="MENSALIDADE">Somente Mensalidade</mat-option>
              <mat-option value="RENEGOCIACAO">Somente Renegociação</mat-option>
            </mat-select>
          </mat-form-field>
          @if (tipoTitulo.value === "AMBOS") {
            <mat-checkbox [formControl]="separar" class="!text-xs">
              Separar em 2 documentos (mensalidade / renegociação)
            </mat-checkbox>
          }
        </div>
        <p class="text-sm m-0" data-testid="resumo-protesto">
          <strong>{{ alvoProtesto().length }}</strong> matrícula(s) com título vencido:
          {{ nomesProtesto() }}
        </p>
        <p class="text-xs text-gray-500 mt-1 mb-0">
          Um documento por matrícula/curso. Títulos já protestados não entram de novo.
        </p>
      }

      @if (executando()) {
        <mat-progress-bar
          class="mt-3"
          [mode]="total() > 0 ? 'determinate' : 'indeterminate'"
          [value]="total() > 0 ? (feitos() / total()) * 100 : 0"
        ></mat-progress-bar>
        @if (total() > 0) {
          <p class="text-xs text-gray-500 mt-1 mb-0">{{ feitos() }} de {{ total() }}</p>
        }
      }
      @if (mensagem()) {
        <p class="text-sm mt-3 mb-0" data-testid="resultado">{{ mensagem() }}</p>
      }
      @if (documentos().length > 0) {
        <div class="mt-3 grid gap-1">
          @for (d of documentos(); track d.id) {
            <div class="flex items-center justify-between gap-2 text-sm">
              <span>{{ d.rotulo }}</span>
              <span class="flex gap-1">
                <button mat-stroked-button type="button" (click)="baixar(d.id, 'docx')">
                  Word
                </button>
                <button mat-stroked-button type="button" (click)="baixar(d.id, 'pdf')">PDF</button>
              </span>
            </div>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [disabled]="executando()" (click)="fechar()">Fechar</button>
      @if (dados.modo === "COBRANCA") {
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="executando() || alvoCobranca().length === 0"
          (click)="gerarCobrancas()"
        >
          Gerar {{ alvoCobranca().length }} cobrança(s)
        </button>
      } @else {
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="executando() || alvoProtesto().length === 0"
          (click)="gerarProtesto()"
        >
          Gerar protesto
        </button>
      }
    </mat-dialog-actions>
  `,
})
export class GerarCobrancaProtestoDialogComponent implements OnInit, OnDestroy {
  readonly dados = inject<DadosGerarCobrancaProtesto>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<GerarCobrancaProtestoDialogComponent, boolean>);
  private readonly asaas = inject(AsaasService);
  private readonly relatorios = inject(RelatoriosService);
  private readonly configuracoes = inject(ConfiguracoesService);
  private readonly snackBar = inject(MatSnackBar);

  readonly abrangencia = new FormControl<AbrangenciaCobranca>("VENCIDOS", { nonNullable: true });
  readonly forma = new FormControl<FormaCobranca>("CADA", { nonNullable: true });
  readonly tipoTitulo = new FormControl<TipoTituloProtesto>("AMBOS", { nonNullable: true });
  readonly separar = new FormControl(false, { nonNullable: true });

  readonly formasAceitas = signal<AsaasBillingType[]>(["BOLETO", "PIX", "CREDIT_CARD"]);
  readonly diasAtraso = signal(0);
  readonly executando = signal(false);
  readonly feitos = signal(0);
  readonly total = signal(0);
  readonly mensagem = signal("");
  readonly documentos = signal<{ id: string; rotulo: string }[]>([]);
  private relatorioId = "";
  private houveMudanca = false;
  private polling?: Subscription;
  /** Muda quando o usuário troca "quais títulos", para recalcular os resumos. */
  private readonly abrangenciaAtual = signal<AbrangenciaCobranca>("VENCIDOS");

  readonly alvoCobranca = computed(() =>
    titulosParaCobranca(
      this.dados.titulos,
      this.dados.matriculaId,
      this.abrangenciaAtual(),
      new Date(),
    ),
  );
  readonly totalCobranca = computed(() =>
    this.alvoCobranca().reduce((soma, t) => soma + Number(t.valor), 0),
  );
  readonly alvoProtesto = computed<OpcaoMatricula[]>(() =>
    matriculasParaProtesto(this.dados.titulos, this.dados.matriculaId, new Date()),
  );
  readonly nomesProtesto = computed(() =>
    this.alvoProtesto()
      .map((o) => o.rotulo)
      .join("; "),
  );
  private readonly formaAtual = signal<FormaCobranca>("CADA");
  readonly semForma = computed(() =>
    this.formaAtual() === "CADA"
      ? this.alvoCobranca().filter((t) => !this.formaDaParcela(t)).length
      : 0,
  );

  ngOnInit(): void {
    this.abrangencia.valueChanges.subscribe((v) => this.abrangenciaAtual.set(v));
    this.forma.valueChanges.subscribe((v) => this.formaAtual.set(v));
    this.configuracoes.obter().subscribe((c) => {
      this.diasAtraso.set(c.diasAtraso);
      this.tipoTitulo.setValue(c.tipoTituloProtestoDefault);
      this.formasAceitas.set(
        (
          [
            ["BOLETO", c.provedorBoleto],
            ["PIX", c.provedorPix],
            // Cartão pela Rede é pago pelo aluno no portal: não gera link aqui (igual à ficha).
            ["CREDIT_CARD", c.provedorCartao === "REDE" ? null : c.provedorCartao],
          ] as const
        )
          .filter(([, provedor]) => provedor != null)
          .map(([tipo]) => tipo),
      );
    });
  }

  ngOnDestroy(): void {
    this.polling?.unsubscribe();
  }

  rotuloForma(f: AsaasBillingType): string {
    return ROTULO_FORMA[f];
  }

  private formaDaParcela(t: TituloAluno): AsaasBillingType | null {
    return t.formaPagamento && this.formasAceitas().includes(t.formaPagamento)
      ? t.formaPagamento
      : null;
  }

  /** Gera uma cobrança por vez (o Asaas limita a taxa) e conta o que deu certo. */
  gerarCobrancas(): void {
    const escolhida = this.forma.value;
    const alvo = this.alvoCobranca()
      .map((t) => ({ t, forma: escolhida === "CADA" ? this.formaDaParcela(t) : escolhida }))
      .filter((x): x is { t: TituloAluno; forma: AsaasBillingType } => x.forma !== null);
    const puladas = this.alvoCobranca().length - alvo.length;
    this.executando.set(true);
    this.mensagem.set("");
    this.feitos.set(0);
    this.total.set(alvo.length);
    let ok = 0;
    let falhas = 0;
    from(alvo)
      .pipe(
        concatMap(({ t, forma }) =>
          this.asaas.gerarCobranca(t.id, forma).pipe(
            catchError(() => {
              falhas++;
              return of(null);
            }),
          ),
        ),
      )
      .subscribe({
        next: (r) => {
          if (r) ok++;
          this.feitos.update((n) => n + 1);
        },
        complete: () => {
          this.executando.set(false);
          if (ok > 0) this.houveMudanca = true;
          const partes = [`${ok} cobrança(s) gerada(s)`];
          if (falhas) partes.push(`${falhas} falharam`);
          if (puladas) partes.push(`${puladas} pulada(s) por falta de forma`);
          this.mensagem.set(partes.join(" · "));
        },
      });
  }

  gerarProtesto(): void {
    const alvo = this.alvoProtesto();
    this.executando.set(true);
    this.mensagem.set("");
    this.documentos.set([]);
    this.total.set(0);
    this.relatorios
      .gerar(
        {
          tipoTituloProtesto: this.tipoTitulo.value,
          separarDocumentosPorTipo: this.separar.value,
          incluirParcelasVencidasRecentes: this.abrangencia.value === "TODOS",
        },
        alvo.map((o) => o.id),
      )
      .subscribe({
        next: ({ id, jobId, totalElegiveis }) => {
          if (totalElegiveis === 0 || !jobId) {
            this.executando.set(false);
            this.mensagem.set(
              "Nenhuma parcela elegível: já foram protestadas ou ainda não passaram do mínimo de dias de atraso.",
            );
            return;
          }
          this.acompanhar(jobId, id, alvo);
        },
        error: () => {
          this.executando.set(false);
          this.mensagem.set("Não foi possível gerar o protesto.");
        },
      });
  }

  private acompanhar(jobId: string, relatorioId: string, alvo: OpcaoMatricula[]): void {
    this.polling?.unsubscribe();
    this.polling = interval(1500)
      .pipe(
        switchMap(() => this.relatorios.statusJob(jobId)),
        takeWhile((s) => s.estado !== "completed" && s.estado !== "failed", true),
      )
      .subscribe({
        next: (s) => {
          if (s.estado === "failed") {
            this.executando.set(false);
            this.mensagem.set(`Falha ao gerar o protesto: ${s.erro ?? "erro desconhecido"}`);
          }
          if (s.estado === "completed") this.finalizarProtesto(relatorioId, alvo);
        },
        error: () => {
          this.executando.set(false);
          this.mensagem.set("Não foi possível acompanhar a geração.");
        },
      });
  }

  private finalizarProtesto(relatorioId: string, alvo: OpcaoMatricula[]): void {
    this.relatorios.buscarPorId(relatorioId).subscribe({
      next: (rel) => {
        this.executando.set(false);
        this.relatorioId = relatorioId;
        const geradas = new Set(
          (rel.itens ?? []).filter((i) => i.documentoGerado).map((i) => i.matriculaId),
        );
        const docs = alvo
          .filter((o) => geradas.has(o.id))
          .map((o) => ({ id: o.id, rotulo: o.rotulo }));
        this.documentos.set(docs);
        this.houveMudanca = docs.length > 0;
        this.mensagem.set(
          docs.length > 0
            ? `${docs.length} documento(s) gerado(s).`
            : "Nenhum documento foi gerado (sem parcelas elegíveis nessas matrículas).",
        );
      },
      error: () => {
        this.executando.set(false);
        this.mensagem.set("O protesto foi gerado, mas não consegui buscar os documentos.");
      },
    });
  }

  baixar(matriculaId: string, formato: "docx" | "pdf"): void {
    this.relatorios.baixarDocumento(this.relatorioId, matriculaId, formato).subscribe({
      next: (resp) =>
        salvarBlobComoArquivo(
          resp.body as Blob,
          extrairNomeArquivo(resp.headers.get("content-disposition"), `documento.${formato}`),
        ),
      error: () =>
        this.snackBar.open("Não foi possível baixar o documento", "Fechar", { duration: 4000 }),
    });
  }

  /** Fecha avisando se algo mudou (cobranças geradas ou protesto), para a lista recarregar. */
  fechar(): void {
    this.ref.close(this.houveMudanca);
  }
}
