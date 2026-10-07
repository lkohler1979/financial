import { CurrencyPipe, DatePipe } from "@angular/common";
import { Component, inject, OnInit, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatSnackBar } from "@angular/material/snack-bar";
import { NfsePagamento, NfsePrevia } from "../../core/models/nfse.model";
import { NfseService } from "../../core/services/nfse.service";
import { formatarCnpj, formatarCpf } from "../../shared/utils/cpf.util";

/** "AAAA-MM" do mês anterior a hoje (competência padrão da emissão). */
function mesAnteriorIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const COR_STATUS: Record<string, string> = {
  AUTORIZADA: "bg-green-100 text-green-700",
  AGENDADA: "bg-amber-100 text-amber-700",
  ERRO: "bg-red-100 text-red-700",
  CANCELADA: "bg-gray-100 text-gray-600",
};

/**
 * Notas fiscais de serviço (NFS-e): prévia das mensalidades/renegociações pagas no mês de
 * referência, emissão manual, conferência de status e reenvio das que deram erro. A emissão
 * automática roda no worker (Configurações → Nota fiscal).
 */
@Component({
  selector: "app-notas-fiscais",
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, MatButtonModule],
  template: `
    <div class="flex flex-wrap items-center gap-3 mb-3">
      <h1 class="text-2xl font-medium m-0">Notas fiscais (NFS-e)</h1>
      <label class="text-sm ml-auto">
        <span class="text-xs text-gray-500 mr-2">Competência</span>
        <input class="border rounded px-2 py-1" type="month" [ngModel]="mes()" (ngModelChange)="trocarMes($event)" />
      </label>
    </div>

    <section class="bg-white rounded-lg border p-4 mb-5">
      <h2 class="text-base font-medium m-0 mb-1">Emitir nota de um pagamento</h2>
      <p class="text-xs text-gray-500 mt-0 mb-3">
        Para emitir a nota de um pagamento específico (qualquer tipo, qualquer mês), busque pelo aluno, CPF/CNPJ ou
        matrícula. A competência vem preenchida com o último dia do mês do pagamento e pode ser alterada.
      </p>
      <form class="flex flex-wrap items-end gap-3" (ngSubmit)="buscarPagamentos()">
        <label class="text-sm">
          <span class="block text-xs text-gray-500">Aluno, CPF/CNPJ ou matrícula</span>
          <input class="border rounded px-2 py-1 w-64" name="busca" [(ngModel)]="busca" />
        </label>
        <label class="text-sm">
          <span class="block text-xs text-gray-500">Pago de</span>
          <input class="border rounded px-2 py-1" type="date" name="de" [(ngModel)]="de" />
        </label>
        <label class="text-sm">
          <span class="block text-xs text-gray-500">até</span>
          <input class="border rounded px-2 py-1" type="date" name="ate" [(ngModel)]="ate" />
        </label>
        <button mat-flat-button color="primary" type="submit" [disabled]="buscando()">Buscar pagamentos</button>
      </form>

      @if (pagamentos(); as lista) {
        <div class="overflow-x-auto mt-3">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-gray-400">
                <th class="p-2">Pago em</th>
                <th class="p-2">Parcela</th>
                <th class="p-2">Aluno</th>
                <th class="p-2">Tomador da nota</th>
                <th class="p-2 text-right">Valor</th>
                <th class="p-2">Nota</th>
                <th class="p-2">Competência</th>
                <th class="p-2"></th>
              </tr>
            </thead>
            <tbody>
              @for (i of lista; track i.parcelaId) {
                <tr class="border-t align-top">
                  <td class="p-2 whitespace-nowrap">{{ i.dataPagamento | date: "dd/MM/yyyy" }}</td>
                  <td class="p-2">
                    {{ i.tipoTitulo }} {{ i.parcela }}
                    @if (!i.geraNotaAutomatica) {
                      <span class="block text-xs text-amber-700">Tipo fora da emissão automática</span>
                    }
                  </td>
                  <td class="p-2">{{ i.aluno }}<span class="block text-xs text-gray-400">{{ i.curso }}</span></td>
                  <td class="p-2">
                    {{ i.tomador.nome }}
                    <span class="block text-xs text-gray-400">
                      {{ i.tomador.origem === "SACADO" ? "Sacado" : "Aluno" }} · {{ documento(i.tomador.documento) }}
                    </span>
                    @for (e of i.erros; track e) { <span class="block text-xs text-red-600">{{ e }}</span> }
                    @for (a of i.avisos; track a) { <span class="block text-xs text-amber-700">{{ a }}</span> }
                  </td>
                  <td class="p-2 text-right whitespace-nowrap">{{ i.valor | currency: "BRL" }}</td>
                  <td class="p-2">
                    @if (i.statusNota) {
                      <span class="px-2 py-0.5 rounded text-xs" [class]="cor(i.statusNota)">{{ i.statusNota }}</span>
                      @if (i.numeroNota) { <span class="block text-xs text-gray-500">Nº {{ i.numeroNota }}</span> }
                    } @else {
                      <span class="text-xs text-gray-400">Sem nota</span>
                    }
                    @if (i.erro) { <span class="block text-xs text-red-600">{{ i.erro }}</span> }
                  </td>
                  <td class="p-2">
                    @if (i.statusNota !== "AUTORIZADA") {
                      <input
                        class="border rounded px-2 py-1"
                        type="date"
                        [max]="hoje"
                        [ngModel]="competenciaDe(i)"
                        (ngModelChange)="definirCompetencia(i.parcelaId, $event)"
                      />
                    }
                  </td>
                  <td class="p-2 text-right whitespace-nowrap">
                    @if (i.statusNota === "AUTORIZADA") {
                      <button mat-button type="button" (click)="abrirPdf(i)">PDF</button>
                    } @else {
                      <button mat-flat-button color="primary" type="button" [disabled]="ocupado() || i.erros.length > 0" (click)="emitirIndividual(i)">
                        Emitir nota
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td class="p-4 text-gray-500" colspan="8">Nenhum pagamento encontrado para esse filtro.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    @if (previa(); as p) {
      <div class="bg-white rounded-lg border p-4 mb-4">
        <p class="text-sm m-0">
          Competência <strong>{{ p.competencia | date: "dd/MM/yyyy" }}</strong> ·
          emissão automática
          <strong [class]="p.ativa ? 'text-green-700' : 'text-gray-500'">{{ p.ativa ? "ligada" : "desligada" }}</strong>
          (até o dia {{ p.diaLimite }} de cada mês{{ p.ativa && !p.janelaAberta ? "; hoje está fora da janela" : "" }}).
        </p>
        <p class="text-xs text-gray-500 mt-1 mb-0">
          Uma nota por parcela paga de Mensalidade ou Renegociação, no nome do sacado (se houver) ou do aluno,
          pelo valor efetivamente pago.
        </p>
        <div class="flex flex-wrap gap-2 mt-3">
          <button mat-flat-button color="primary" type="button" [disabled]="ocupado() || p.pendentes.length === 0" (click)="emitir()">
            Emitir {{ p.pendentes.length }} pendente(s) — {{ p.totalPendente | currency: "BRL" }}
          </button>
          <button mat-stroked-button type="button" [disabled]="ocupado()" (click)="atualizarStatus()">Atualizar status no Asaas</button>
        </div>
      </div>

      <h2 class="text-base font-medium mb-1">A emitir ({{ p.pendentes.length }})</h2>
      <div class="bg-white rounded-lg border overflow-x-auto mb-5">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400">
              <th class="p-2">Pago em</th>
              <th class="p-2">Parcela</th>
              <th class="p-2">Aluno</th>
              <th class="p-2">Tomador da nota</th>
              <th class="p-2 text-right">Valor</th>
              <th class="p-2">Situação</th>
              <th class="p-2"></th>
            </tr>
          </thead>
          <tbody>
            @for (i of p.pendentes; track i.parcelaId) {
              <tr class="border-t align-top">
                <td class="p-2 whitespace-nowrap">{{ i.dataPagamento | date: "dd/MM/yyyy" }}</td>
                <td class="p-2">{{ i.tipoTitulo }} {{ i.parcela }}</td>
                <td class="p-2">{{ i.aluno }}<span class="block text-xs text-gray-400">{{ i.curso }}</span></td>
                <td class="p-2">
                  {{ i.tomador.nome }}
                  <span class="block text-xs text-gray-400">
                    {{ i.tomador.origem === "SACADO" ? "Sacado" : "Aluno" }} · {{ documento(i.tomador.documento) }}
                  </span>
                  @for (e of i.erros; track e) { <span class="block text-xs text-red-600">{{ e }}</span> }
                  @for (a of i.avisos; track a) { <span class="block text-xs text-amber-700">{{ a }}</span> }
                </td>
                <td class="p-2 text-right whitespace-nowrap">{{ i.valor | currency: "BRL" }}</td>
                <td class="p-2">
                  @if (i.statusNota) {
                    <span class="px-2 py-0.5 rounded text-xs" [class]="cor(i.statusNota)">{{ i.statusNota }}</span>
                  } @else {
                    <span class="text-xs text-gray-400">Pendente</span>
                  }
                  @if (i.erro) { <span class="block text-xs text-red-600">{{ i.erro }}</span> }
                </td>
                <td class="p-2 text-right">
                  @if (i.statusNota === "ERRO" || i.statusNota === "AGENDADA") {
                    <button mat-button type="button" [disabled]="ocupado()" (click)="reemitir(i.parcelaId)">Reenviar</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td class="p-4 text-gray-500" colspan="7">Nenhuma mensalidade/renegociação paga neste mês aguardando nota.</td></tr>
            }
          </tbody>
        </table>
      </div>

      <h2 class="text-base font-medium mb-1">Notas desta competência ({{ p.emitidas.length }})</h2>
      <div class="bg-white rounded-lg border overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400">
              <th class="p-2">Nº</th>
              <th class="p-2">Aluno</th>
              <th class="p-2">Tomador</th>
              <th class="p-2 text-right">Valor</th>
              <th class="p-2">Situação</th>
              <th class="p-2"></th>
            </tr>
          </thead>
          <tbody>
            @for (e of p.emitidas; track e.parcelaId) {
              <tr class="border-t">
                <td class="p-2">{{ e.numero ?? "—" }}</td>
                <td class="p-2">{{ e.aluno }}</td>
                <td class="p-2">{{ e.tomador }}</td>
                <td class="p-2 text-right whitespace-nowrap">{{ e.valor | currency: "BRL" }}</td>
                <td class="p-2">
                  <span class="px-2 py-0.5 rounded text-xs" [class]="cor(e.status)">{{ e.status }}</span>
                  @if (e.erro) { <span class="block text-xs text-red-600">{{ e.erro }}</span> }
                </td>
                <td class="p-2 text-right">
                  @if (e.pdfUrl) { <a mat-button [href]="e.pdfUrl" target="_blank" rel="noopener">PDF</a> }
                  @else if (e.viaSefin) { <button mat-button type="button" (click)="baixarDanfse(e.parcelaId)">PDF</button> }
                </td>
              </tr>
            } @empty {
              <tr><td class="p-4 text-gray-500" colspan="6">Nenhuma nota gerada para esta competência.</td></tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="text-gray-500">Carregando...</p>
    }
  `,
})
export class NotasFiscaisComponent implements OnInit {
  private readonly service = inject(NfseService);
  private readonly snackBar = inject(MatSnackBar);

  readonly mes = signal(mesAnteriorIso());
  readonly previa = signal<NfsePrevia | null>(null);
  readonly ocupado = signal(false);

  // Nota individual de um pagamento
  busca = "";
  de = "";
  ate = "";
  readonly hoje = new Date().toISOString().slice(0, 10);
  readonly pagamentos = signal<NfsePagamento[] | null>(null);
  readonly buscando = signal(false);
  /** Competência escolhida por parcela (sobrepõe a sugerida). */
  readonly competencias = signal<Record<string, string>>({});

  ngOnInit(): void {
    this.carregar();
  }

  trocarMes(valor: string): void {
    if (!valor) return;
    this.mes.set(valor);
    this.carregar();
  }

  cor(status: string): string {
    return COR_STATUS[status] ?? "bg-gray-100";
  }

  documento(valor: string): string {
    return valor.length === 14 ? formatarCnpj(valor) : formatarCpf(valor);
  }

  competenciaDe(item: NfsePagamento): string {
    return this.competencias()[item.parcelaId] ?? item.competenciaPadrao ?? this.hoje;
  }

  definirCompetencia(parcelaId: string, valor: string): void {
    this.competencias.update((atual) => ({ ...atual, [parcelaId]: valor }));
  }

  buscarPagamentos(): void {
    this.buscando.set(true);
    this.service.pagamentos({ busca: this.busca.trim() || undefined, de: this.de || undefined, ate: this.ate || undefined }).subscribe({
      next: (lista) => {
        this.pagamentos.set(lista);
        this.buscando.set(false);
      },
      error: () => this.buscando.set(false),
    });
  }

  emitirIndividual(item: NfsePagamento): void {
    const competencia = this.competenciaDe(item);
    const aviso = item.geraNotaAutomatica ? "" : `\n\nAtenção: "${item.tipoTitulo}" normalmente não gera nota fiscal.`;
    if (
      !confirm(
        `Emitir a nota de ${item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para ${item.tomador.nome}, competência ${competencia.split("-").reverse().join("/")}? A emissão não pode ser desfeita por aqui.${aviso}`,
      )
    ) {
      return;
    }
    this.ocupado.set(true);
    this.service.emitirIndividual(item.parcelaId, competencia).subscribe({
      next: () => {
        this.ocupado.set(false);
        this.snackBar.open("Nota emitida", "Fechar", { duration: 5000 });
        this.buscarPagamentos();
        this.carregar();
      },
      error: () => {
        this.ocupado.set(false);
        this.buscarPagamentos();
      },
    });
  }

  /** Abre o PDF: link direto do Asaas ou DANFSe baixado da SEFIN pela API. */
  abrirPdf(item: NfsePagamento): void {
    if (item.pdfUrl) window.open(item.pdfUrl, "_blank", "noopener");
    else if (item.viaSefin) this.baixarDanfse(item.parcelaId);
  }

  baixarDanfse(parcelaId: string): void {
    this.service.danfse(parcelaId).subscribe((pdf) => window.open(URL.createObjectURL(pdf), "_blank"));
  }

  private carregar(): void {
    this.service.previa(this.mes()).subscribe((p) => this.previa.set(p));
  }

  emitir(): void {
    const total = this.previa()?.pendentes.length ?? 0;
    if (!confirm(`Emitir ${total} nota(s) fiscal(is) de serviço agora? A emissão não pode ser desfeita por aqui.`)) return;
    this.ocupado.set(true);
    this.service.emitir(this.mes()).subscribe({
      next: (r) => {
        this.ocupado.set(false);
        const resto = r.restantes > 0 ? ` ${r.restantes} ficaram para a próxima execução.` : "";
        this.snackBar.open(
          `${r.emitidas} emitida(s), ${r.agendadas} em processamento, ${r.erros.length} com erro.${resto}`,
          "Fechar",
          { duration: 10000 },
        );
        this.carregar();
      },
      error: () => this.ocupado.set(false),
    });
  }

  atualizarStatus(): void {
    this.ocupado.set(true);
    this.service.atualizarStatus().subscribe({
      next: (r) => {
        this.ocupado.set(false);
        this.snackBar.open(`${r.conferidas} conferida(s), ${r.autorizadas} autorizada(s), ${r.erros} com erro`, "Fechar", { duration: 5000 });
        this.carregar();
      },
      error: () => this.ocupado.set(false),
    });
  }

  reemitir(parcelaId: string): void {
    this.ocupado.set(true);
    this.service.reemitir(parcelaId).subscribe({
      next: () => {
        this.ocupado.set(false);
        this.carregar();
      },
      error: () => this.ocupado.set(false),
    });
  }
}
