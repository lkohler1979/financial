import { Component, inject, OnInit, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatSnackBar } from "@angular/material/snack-bar";
import { AuthService } from "../../core/auth/auth.service";
import { classeSituacaoMatricula, rotuloSituacaoMatricula } from "../../core/models/matricula.model";
import { SacadoFicha, SacadoListado } from "../../core/models/sacado.model";
import { SacadosService } from "../../core/services/sacados.service";
import { formatarCnpj, formatarCpf } from "../../shared/utils/cpf.util";

/** Manutenção de sacados (responsáveis financeiros): consulta, edição de contato e remoção. */
@Component({
  selector: "app-sacados-list",
  standalone: true,
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatPaginatorModule],
  template: `
    <div class="flex flex-wrap items-center gap-3 mb-3">
      <h1 class="text-2xl font-medium m-0">Sacados</h1>
      <input
        class="border rounded px-3 py-1.5 ml-auto w-72"
        placeholder="Buscar por nome, CPF ou CNPJ"
        [ngModel]="busca"
        (ngModelChange)="buscar($event)"
      />
    </div>
    <p class="text-xs text-gray-500 mb-3">
      Responsável financeiro de matrículas quando não é o próprio aluno (mãe, empresa...). O cadastro nasce
      no passo de pagamento da matrícula; CPF/CNPJ não mudam depois.
    </p>

    <div class="bg-white rounded shadow-sm overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-gray-400">
            <th class="p-2">Tipo</th>
            <th class="p-2">CPF/CNPJ</th>
            <th class="p-2">Nome / razão social</th>
            <th class="p-2">E-mail</th>
            <th class="p-2">Telefone</th>
            <th class="p-2 text-right">Matrículas</th>
            <th class="p-2"></th>
          </tr>
        </thead>
        <tbody>
          @for (s of itens(); track s.id) {
            <tr class="border-t" [class.bg-blue-50]="selecionado()?.id === s.id">
              <td class="p-2">{{ s.tipoPessoa === "FISICA" ? "PF" : "PJ" }}</td>
              <td class="p-2 whitespace-nowrap">{{ documento(s) }}</td>
              <td class="p-2">{{ s.nome }}</td>
              <td class="p-2">{{ s.email || "—" }}</td>
              <td class="p-2 whitespace-nowrap">{{ s.telefone || "—" }}</td>
              <td class="p-2 text-right">{{ s._count.matriculas }}</td>
              <td class="p-2 text-right whitespace-nowrap">
                <button mat-icon-button type="button" aria-label="Editar" (click)="abrir(s)">
                  <mat-icon>edit</mat-icon>
                </button>
              </td>
            </tr>
          } @empty {
            <tr><td class="p-4 text-gray-500" colspan="7">Nenhum sacado encontrado.</td></tr>
          }
        </tbody>
      </table>
      <mat-paginator
        [length]="total()"
        [pageSize]="pageSize"
        [pageIndex]="page - 1"
        [pageSizeOptions]="[20, 50, 100]"
        (page)="mudarPagina($event)"
      ></mat-paginator>
    </div>

    @if (selecionado(); as s) {
      <section class="bg-white rounded shadow-sm p-5 mt-4">
        <p class="text-sm font-medium text-gray-700 mb-3">
          {{ s.tipoPessoa === "FISICA" ? "Pessoa física" : "Pessoa jurídica" }} — {{ documento(s) }}
        </p>
        <div class="grid gap-3 md:grid-cols-4">
          <label class="text-sm md:col-span-2">
            <span class="block text-xs text-gray-500">{{ s.tipoPessoa === "FISICA" ? "Nome" : "Razão social" }}</span>
            <input class="border rounded px-2 py-1 w-full" [(ngModel)]="nome" />
          </label>
          <label class="text-sm">
            <span class="block text-xs text-gray-500">E-mail</span>
            <input class="border rounded px-2 py-1 w-full" type="email" [(ngModel)]="email" />
          </label>
          <label class="text-sm">
            <span class="block text-xs text-gray-500">Telefone</span>
            <input class="border rounded px-2 py-1 w-full" [(ngModel)]="telefone" />
          </label>
          @if (s.tipoPessoa === "FISICA") {
            <label class="text-sm">
              <span class="block text-xs text-gray-500">Data de nascimento (acesso à área do aluno)</span>
              <input class="border rounded px-2 py-1 w-full" type="date" [(ngModel)]="dataNascimento" />
            </label>
          }
          <label class="text-sm">
            <span class="block text-xs text-gray-500">CEP</span>
            <input class="border rounded px-2 py-1 w-full" maxlength="9" [(ngModel)]="cep" />
          </label>
          <label class="text-sm md:col-span-2">
            <span class="block text-xs text-gray-500">Logradouro</span>
            <input class="border rounded px-2 py-1 w-full" [(ngModel)]="endereco" />
          </label>
          <label class="text-sm">
            <span class="block text-xs text-gray-500">Número</span>
            <input class="border rounded px-2 py-1 w-full" [(ngModel)]="numero" />
          </label>
          <label class="text-sm">
            <span class="block text-xs text-gray-500">Complemento</span>
            <input class="border rounded px-2 py-1 w-full" [(ngModel)]="complemento" />
          </label>
          <label class="text-sm">
            <span class="block text-xs text-gray-500">Bairro</span>
            <input class="border rounded px-2 py-1 w-full" [(ngModel)]="bairro" />
          </label>
        </div>
        <div class="flex gap-2 mt-3">
          <button mat-flat-button color="primary" type="button" [disabled]="!nome.trim() || salvando()" (click)="salvar(s)">
            Salvar
          </button>
          @if (podeRemover()) {
            <button mat-button color="warn" type="button" [disabled]="s.matriculas.length > 0" (click)="remover(s)">
              Remover sacado
            </button>
          }
          <button mat-button type="button" (click)="selecionado.set(null)">Fechar</button>
        </div>

        <p class="text-xs text-gray-500 mt-4 mb-1">Matrículas que ele paga ({{ s.matriculas.length }})</p>
        <table class="w-full text-sm">
          <tbody>
            @for (m of s.matriculas; track m.id) {
              <tr class="border-t">
                <td class="py-1 pr-2 whitespace-nowrap">{{ m.numeroMatricula || "—" }}</td>
                <td class="pr-2">{{ m.aluno.nome }}</td>
                <td class="pr-2">{{ m.curso.nome }}</td>
                <td class="pr-2">
                  <span class="px-2 py-0.5 rounded text-xs whitespace-nowrap" [class]="classeSituacao(m.situacao)">{{ rotuloSituacao(m.situacao) }}</span>
                </td>
                <td class="text-right">
                  <a mat-icon-button [routerLink]="['/matriculas', m.id]" aria-label="Abrir matrícula">
                    <mat-icon>open_in_new</mat-icon>
                  </a>
                </td>
              </tr>
            } @empty {
              <tr><td class="py-2 text-gray-500">Sem matrículas — pode ser removido.</td></tr>
            }
          </tbody>
        </table>
      </section>
    }
  `,
})
export class SacadosListComponent implements OnInit {
  private readonly service = inject(SacadosService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  readonly itens = signal<SacadoListado[]>([]);
  readonly total = signal(0);
  readonly selecionado = signal<SacadoFicha | null>(null);
  readonly salvando = signal(false);

  busca = "";
  page = 1;
  pageSize = 20;
  private temporizador?: ReturnType<typeof setTimeout>;

  nome = "";
  email = "";
  telefone = "";
  dataNascimento = "";
  cep = "";
  endereco = "";
  numero = "";
  complemento = "";
  bairro = "";

  protected readonly rotuloSituacao = rotuloSituacaoMatricula;
  protected readonly classeSituacao = classeSituacaoMatricula;

  ngOnInit(): void {
    this.carregar();
  }

  podeRemover(): boolean {
    return this.auth.temPerfil("ADMINISTRADOR", "FINANCEIRO");
  }

  documento(s: { tipoPessoa: string; cpfCnpj: string }): string {
    return s.tipoPessoa === "FISICA" ? formatarCpf(s.cpfCnpj) : formatarCnpj(s.cpfCnpj);
  }

  buscar(valor: string): void {
    this.busca = valor;
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      this.page = 1;
      this.carregar();
    }, 350);
  }

  mudarPagina(e: PageEvent): void {
    this.page = e.pageIndex + 1;
    this.pageSize = e.pageSize;
    this.carregar();
  }

  private carregar(): void {
    this.service.listar(this.busca.trim(), this.page, this.pageSize).subscribe((r) => {
      this.itens.set(r.data);
      this.total.set(r.total);
    });
  }

  abrir(s: { id: string }): void {
    this.service.ficha(s.id).subscribe((ficha) => {
      this.selecionado.set(ficha);
      this.nome = ficha.nome;
      this.email = ficha.email ?? "";
      this.telefone = ficha.telefone ?? "";
      this.dataNascimento = ficha.dataNascimento ? ficha.dataNascimento.substring(0, 10) : "";
      this.cep = ficha.cep ?? "";
      this.endereco = ficha.endereco ?? "";
      this.numero = ficha.numero ?? "";
      this.complemento = ficha.complemento ?? "";
      this.bairro = ficha.bairro ?? "";
    });
  }

  salvar(s: SacadoFicha): void {
    this.salvando.set(true);
    this.service
      .atualizar(s.id, {
        nome: this.nome.trim(),
        email: this.email.trim() || null,
        telefone: this.telefone.trim() || null,
        ...(s.tipoPessoa === "FISICA" && this.dataNascimento ? { dataNascimento: this.dataNascimento } : {}),
        cep: this.cep.trim() || null,
        endereco: this.endereco.trim() || null,
        numero: this.numero.trim() || null,
        complemento: this.complemento.trim() || null,
        bairro: this.bairro.trim() || null,
      })
      .subscribe({
        next: () => {
          this.salvando.set(false);
          this.snackBar.open("Sacado atualizado", "Fechar", { duration: 3000 });
          this.carregar();
          this.abrir(s);
        },
        error: () => this.salvando.set(false),
      });
  }

  remover(s: SacadoFicha): void {
    if (!confirm(`Remover o sacado "${s.nome}"?`)) return;
    this.service.remover(s.id).subscribe(() => {
      this.snackBar.open("Sacado removido", "Fechar", { duration: 3000 });
      this.selecionado.set(null);
      this.carregar();
    });
  }
}
