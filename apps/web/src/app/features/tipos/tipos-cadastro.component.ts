import { Component, inject, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBar } from "@angular/material/snack-bar";
import { TipoDescontoCupom } from "../../core/models/cupom.model";
import { EscopoDocumento, TipoDocumento } from "../../core/models/documento.model";
import { FormaPagamento, TipoCobranca } from "../../core/models/tipo-cobranca.model";
import { CuponsService } from "../../core/services/cupons.service";
import { DocumentosService } from "../../core/services/documentos.service";
import { SolicitacoesService } from "../../core/services/solicitacoes.service";
import { TiposCobrancaService } from "../../core/services/tipos-cobranca.service";

/** Linha editável de tipo de cobrança — `opcoes` é o texto "1, 6, 12". */
interface LinhaCobranca {
  id?: string;
  nome: string;
  obrigatorio: boolean;
  usaValorDoCurso: boolean;
  valorPadrao: number | null;
  opcoes: string;
  prefixoTitulo: string;
  ordem: number;
  ativo: boolean;
  formaPagamentoPadrao: FormaPagamento | "";
  aceitaCupom: boolean;
  entraNoProtesto: boolean;
  disponivelNoCadastro: boolean;
}

interface LinhaDocumento {
  id?: string;
  nome: string;
  escopo: EscopoDocumento;
  obrigatorio: boolean;
  ordem: number;
  ativo: boolean;
}

interface LinhaCupom {
  id?: string;
  codigo: string;
  descricao: string;
  tipoDesconto: TipoDescontoCupom;
  valor: number | null;
  validadeAte: string;
  ativo: boolean;
}

interface LinhaSolicitacao {
  id?: string;
  nome: string;
  descricao: string;
  ordem: number;
  ativo: boolean;
}

/**
 * Cadastros de apoio da matrícula (só administrador): tipos de cobrança
 * (Mensalidade, Taxa de matrícula, Renegociação...), cupons de desconto e
 * tipos de documento (CPF, RG...).
 */
@Component({
  selector: "app-tipos-cadastro",
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatIconModule],
  template: `
    <h1 class="text-2xl font-medium mb-4">Tipos</h1>

    <section class="bg-white rounded-lg border p-5 mb-5">
      <p class="text-sm font-medium text-gray-700 mb-1">Tipos de cobrança</p>
      <p class="text-xs text-gray-500 mb-3">
        Mensalidade, Taxa de matrícula e Renegociação são tipos de cobrança. "Valor do curso" usa o
        valor padrão do curso; senão vale o valor padrão do tipo. "No protesto" desmarcado = as
        parcelas desse tipo nunca entram no relatório/documento de protesto. "No cadastro"
        desmarcado = não aparece ao cadastrar a matrícula. Opções de parcelas separadas por vírgula.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400">
              <th class="py-1 pr-2">Nome</th>
              <th class="pr-2">Obrigatório</th>
              <th class="pr-2">Valor do curso</th>
              <th class="pr-2">Valor padrão</th>
              <th class="pr-2">Parcelas</th>
              <th class="pr-2">Forma padrão</th>
              <th class="pr-2">Aceita cupom</th>
              <th class="pr-2">No protesto</th>
              <th class="pr-2">No cadastro</th>
              <th class="pr-2">Prefixo</th>
              <th class="pr-2">Ordem</th>
              <th class="pr-2">Ativo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (l of cobrancas; track $index) {
              <tr class="border-t">
                <td class="py-1 pr-2"><input class="border rounded px-2 py-1 w-40" [(ngModel)]="l.nome" /></td>
                <td class="pr-2"><mat-checkbox [(ngModel)]="l.obrigatorio"></mat-checkbox></td>
                <td class="pr-2"><mat-checkbox [(ngModel)]="l.usaValorDoCurso"></mat-checkbox></td>
                <td class="pr-2">
                  <input
                    class="border rounded px-2 py-1 w-24"
                    type="number"
                    min="0"
                    step="0.01"
                    [(ngModel)]="l.valorPadrao"
                    [disabled]="l.usaValorDoCurso"
                  />
                </td>
                <td class="pr-2"><input class="border rounded px-2 py-1 w-28" [(ngModel)]="l.opcoes" /></td>
                <td class="pr-2">
                  <select class="border rounded px-2 py-1" [(ngModel)]="l.formaPagamentoPadrao">
                    <option value="">—</option>
                    <option value="BOLETO">Boleto</option>
                    <option value="PIX">Pix</option>
                    <option value="CREDIT_CARD">Cartão</option>
                  </select>
                </td>
                <td class="pr-2"><mat-checkbox [(ngModel)]="l.aceitaCupom"></mat-checkbox></td>
                <td class="pr-2"><mat-checkbox [(ngModel)]="l.entraNoProtesto"></mat-checkbox></td>
                <td class="pr-2"><mat-checkbox [(ngModel)]="l.disponivelNoCadastro"></mat-checkbox></td>
                <td class="pr-2"><input class="border rounded px-2 py-1 w-14" maxlength="5" [(ngModel)]="l.prefixoTitulo" /></td>
                <td class="pr-2"><input class="border rounded px-2 py-1 w-12" type="number" [(ngModel)]="l.ordem" /></td>
                <td class="pr-2"><mat-checkbox [(ngModel)]="l.ativo"></mat-checkbox></td>
                <td>
                  <button mat-icon-button type="button" aria-label="Salvar" (click)="salvarCobranca(l)">
                    <mat-icon>save</mat-icon>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <button mat-stroked-button type="button" class="mt-3" (click)="novaCobranca()">
        <mat-icon>add</mat-icon> Novo tipo de cobrança
      </button>
    </section>

    <section class="bg-white rounded-lg border p-5 mb-5">
      <p class="text-sm font-medium text-gray-700 mb-1">Cupons de desconto</p>
      <p class="text-xs text-gray-500 mb-3">
        Só cupons cadastrados aqui podem ser aplicados no cadastro da matrícula, e só nos tipos de
        cobrança que aceitam cupom. Percentual = % sobre o valor; Valor = R$ abatido do total da
        cobrança.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400">
              <th class="py-1 pr-2">Código</th>
              <th class="pr-2">Descrição</th>
              <th class="pr-2">Tipo</th>
              <th class="pr-2">Desconto</th>
              <th class="pr-2">Válido até</th>
              <th class="pr-2">Ativo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (l of cupons; track $index) {
              <tr class="border-t">
                <td class="py-1 pr-2"><input class="border rounded px-2 py-1 w-32 uppercase" [(ngModel)]="l.codigo" /></td>
                <td class="pr-2"><input class="border rounded px-2 py-1 w-56" [(ngModel)]="l.descricao" /></td>
                <td class="pr-2">
                  <select class="border rounded px-2 py-1" [(ngModel)]="l.tipoDesconto">
                    <option value="PERCENTUAL">Percentual (%)</option>
                    <option value="VALOR">Valor (R$)</option>
                  </select>
                </td>
                <td class="pr-2"><input class="border rounded px-2 py-1 w-24" type="number" min="0" step="0.01" [(ngModel)]="l.valor" /></td>
                <td class="pr-2"><input class="border rounded px-2 py-1" type="date" [(ngModel)]="l.validadeAte" /></td>
                <td class="pr-2"><mat-checkbox [(ngModel)]="l.ativo"></mat-checkbox></td>
                <td>
                  <button mat-icon-button type="button" aria-label="Salvar" (click)="salvarCupom(l)">
                    <mat-icon>save</mat-icon>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <button mat-stroked-button type="button" class="mt-3" (click)="novoCupom()">
        <mat-icon>add</mat-icon> Novo cupom
      </button>
    </section>

    <section class="bg-white rounded-lg border p-5 mb-5">
      <p class="text-sm font-medium text-gray-700 mb-1">Tipos de solicitação (área do aluno)</p>
      <p class="text-xs text-gray-500 mb-3">
        Documentos que o aluno pode pedir à secretaria pela área do aluno (declaração de matrícula,
        histórico...). Os pedidos aparecem em Solicitações.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400">
              <th class="py-1 pr-2">Nome</th>
              <th class="pr-2">Descrição</th>
              <th class="pr-2">Ordem</th>
              <th class="pr-2">Ativo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (l of solicitacoes; track $index) {
              <tr class="border-t">
                <td class="py-1 pr-2"><input class="border rounded px-2 py-1 w-64" [(ngModel)]="l.nome" /></td>
                <td class="pr-2"><input class="border rounded px-2 py-1 w-72" [(ngModel)]="l.descricao" /></td>
                <td class="pr-2"><input class="border rounded px-2 py-1 w-14" type="number" [(ngModel)]="l.ordem" /></td>
                <td class="pr-2"><mat-checkbox [(ngModel)]="l.ativo"></mat-checkbox></td>
                <td>
                  <button mat-icon-button type="button" aria-label="Salvar" (click)="salvarSolicitacao(l)">
                    <mat-icon>save</mat-icon>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <button mat-stroked-button type="button" class="mt-3" (click)="novaSolicitacao()">
        <mat-icon>add</mat-icon> Novo tipo de solicitação
      </button>
    </section>

    <section class="bg-white rounded-lg border p-5">
      <p class="text-sm font-medium text-gray-700 mb-1">Tipos de documento</p>
      <p class="text-xs text-gray-500 mb-3">
        "Aluno" vale para todas as matrículas do aluno (CPF, RG...); "Matrícula" é específico de
        cada matrícula (contrato...). O escopo não muda depois de criado.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400">
              <th class="py-1 pr-2">Nome</th>
              <th class="pr-2">Escopo</th>
              <th class="pr-2">Obrigatório</th>
              <th class="pr-2">Ordem</th>
              <th class="pr-2">Ativo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (l of documentos; track $index) {
              <tr class="border-t">
                <td class="py-1 pr-2"><input class="border rounded px-2 py-1 w-64" [(ngModel)]="l.nome" /></td>
                <td class="pr-2">
                  @if (l.id) {
                    {{ l.escopo === "ALUNO" ? "Aluno" : "Matrícula" }}
                  } @else {
                    <select class="border rounded px-2 py-1" [(ngModel)]="l.escopo">
                      <option value="ALUNO">Aluno</option>
                      <option value="MATRICULA">Matrícula</option>
                    </select>
                  }
                </td>
                <td class="pr-2"><mat-checkbox [(ngModel)]="l.obrigatorio"></mat-checkbox></td>
                <td class="pr-2"><input class="border rounded px-2 py-1 w-14" type="number" [(ngModel)]="l.ordem" /></td>
                <td class="pr-2"><mat-checkbox [(ngModel)]="l.ativo"></mat-checkbox></td>
                <td>
                  <button mat-icon-button type="button" aria-label="Salvar" (click)="salvarDocumento(l)">
                    <mat-icon>save</mat-icon>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <button mat-stroked-button type="button" class="mt-3" (click)="novoDocumento()">
        <mat-icon>add</mat-icon> Novo tipo de documento
      </button>
    </section>
  `,
})
export class TiposCadastroComponent implements OnInit {
  private readonly cobrancaService = inject(TiposCobrancaService);
  private readonly cuponsService = inject(CuponsService);
  private readonly documentosService = inject(DocumentosService);
  private readonly solicitacoesService = inject(SolicitacoesService);
  private readonly snackBar = inject(MatSnackBar);

  cobrancas: LinhaCobranca[] = [];
  cupons: LinhaCupom[] = [];
  documentos: LinhaDocumento[] = [];
  solicitacoes: LinhaSolicitacao[] = [];

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    this.cobrancaService.listar(true).subscribe((tipos) => {
      this.cobrancas = tipos.map((t: TipoCobranca) => ({
        id: t.id,
        nome: t.nome,
        obrigatorio: t.obrigatorio,
        usaValorDoCurso: t.usaValorDoCurso,
        valorPadrao: t.valorPadrao,
        opcoes: t.opcoesParcelas.join(", "),
        prefixoTitulo: t.prefixoTitulo ?? "",
        ordem: t.ordem,
        ativo: t.ativo,
        formaPagamentoPadrao: t.formaPagamentoPadrao ?? "",
        aceitaCupom: t.aceitaCupom,
        entraNoProtesto: t.entraNoProtesto,
        disponivelNoCadastro: t.disponivelNoCadastro,
      }));
    });
    this.cuponsService.listar().subscribe((cupons) => {
      this.cupons = cupons.map((c) => ({
        id: c.id,
        codigo: c.codigo,
        descricao: c.descricao ?? "",
        tipoDesconto: c.tipoDesconto,
        valor: c.valor,
        validadeAte: c.validadeAte ? c.validadeAte.substring(0, 10) : "",
        ativo: c.ativo,
      }));
    });
    this.solicitacoesService.listarTipos(true).subscribe((tipos) => {
      this.solicitacoes = tipos.map((t) => ({
        id: t.id,
        nome: t.nome,
        descricao: t.descricao ?? "",
        ordem: t.ordem ?? 0,
        ativo: t.ativo ?? true,
      }));
    });
    this.documentosService.listarTipos(true).subscribe((tipos) => {
      this.documentos = tipos.map((t: TipoDocumento) => ({
        id: t.id,
        nome: t.nome,
        escopo: t.escopo,
        obrigatorio: t.obrigatorio,
        ordem: t.ordem ?? 0,
        ativo: t.ativo ?? true,
      }));
    });
  }

  novaCobranca(): void {
    this.cobrancas = [
      ...this.cobrancas,
      {
        nome: "",
        obrigatorio: false,
        usaValorDoCurso: false,
        valorPadrao: null,
        opcoes: "1",
        prefixoTitulo: "",
        ordem: this.cobrancas.length + 1,
        ativo: true,
        formaPagamentoPadrao: "BOLETO",
        aceitaCupom: false,
        entraNoProtesto: true,
        disponivelNoCadastro: true,
      },
    ];
  }

  novoCupom(): void {
    this.cupons = [
      ...this.cupons,
      { codigo: "", descricao: "", tipoDesconto: "PERCENTUAL", valor: null, validadeAte: "", ativo: true },
    ];
  }

  novaSolicitacao(): void {
    this.solicitacoes = [
      ...this.solicitacoes,
      { nome: "", descricao: "", ordem: this.solicitacoes.length + 1, ativo: true },
    ];
  }

  salvarSolicitacao(l: LinhaSolicitacao): void {
    const payload = {
      nome: l.nome,
      descricao: l.descricao || null,
      ordem: Number(l.ordem),
      ativo: l.ativo,
    };
    const req = l.id
      ? this.solicitacoesService.atualizarTipo(l.id, payload)
      : this.solicitacoesService.criarTipo(payload);
    req.subscribe({
      next: () => {
        this.snackBar.open("Tipo de solicitação salvo", "Fechar", { duration: 3000 });
        this.carregar();
      },
      error: (e) => this.erro(e),
    });
  }

  novoDocumento(): void {
    this.documentos = [
      ...this.documentos,
      { nome: "", escopo: "ALUNO", obrigatorio: true, ordem: this.documentos.length + 1, ativo: true },
    ];
  }

  salvarCobranca(l: LinhaCobranca): void {
    const opcoesParcelas = l.opcoes
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    const payload = {
      nome: l.nome,
      obrigatorio: l.obrigatorio,
      usaValorDoCurso: l.usaValorDoCurso,
      valorPadrao: l.usaValorDoCurso ? null : l.valorPadrao || null,
      opcoesParcelas,
      prefixoTitulo: l.prefixoTitulo || null,
      ordem: Number(l.ordem),
      ativo: l.ativo,
      formaPagamentoPadrao: l.formaPagamentoPadrao || null,
      aceitaCupom: l.aceitaCupom,
      entraNoProtesto: l.entraNoProtesto,
      disponivelNoCadastro: l.disponivelNoCadastro,
    };
    const req = l.id ? this.cobrancaService.atualizar(l.id, payload) : this.cobrancaService.criar(payload);
    req.subscribe({
      next: () => {
        this.snackBar.open("Tipo de cobrança salvo", "Fechar", { duration: 3000 });
        this.carregar();
      },
      error: (e) => this.erro(e),
    });
  }

  salvarCupom(l: LinhaCupom): void {
    const payload = {
      codigo: l.codigo,
      descricao: l.descricao || null,
      tipoDesconto: l.tipoDesconto,
      valor: Number(l.valor),
      validadeAte: l.validadeAte || null,
      ativo: l.ativo,
    };
    const req = l.id ? this.cuponsService.atualizar(l.id, payload) : this.cuponsService.criar(payload);
    req.subscribe({
      next: () => {
        this.snackBar.open("Cupom salvo", "Fechar", { duration: 3000 });
        this.carregar();
      },
      error: (e) => this.erro(e),
    });
  }

  salvarDocumento(l: LinhaDocumento): void {
    const req = l.id
      ? this.documentosService.atualizarTipo(l.id, {
          nome: l.nome,
          obrigatorio: l.obrigatorio,
          ordem: Number(l.ordem),
          ativo: l.ativo,
        })
      : this.documentosService.criarTipo({
          nome: l.nome,
          escopo: l.escopo,
          obrigatorio: l.obrigatorio,
          ordem: Number(l.ordem),
        });
    req.subscribe({
      next: () => {
        this.snackBar.open("Tipo de documento salvo", "Fechar", { duration: 3000 });
        this.carregar();
      },
      error: (e) => this.erro(e),
    });
  }

  private erro(e: { error?: { mensagem?: string } }): void {
    this.snackBar.open(e?.error?.mensagem ?? "Não foi possível salvar", "Fechar", { duration: 5000 });
  }
}
