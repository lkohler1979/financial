import { Component, inject, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatRadioModule } from "@angular/material/radio";
import { Sacado, SacadoPayload, TipoPessoaSacado } from "../../core/models/sacado.model";
import { SacadosService } from "../../core/services/sacados.service";
import { formatarCnpj, formatarCpf, normalizarCpf, validarCnpj, validarCpf } from "../../shared/utils/cpf.util";

/**
 * "Responsável financeiro" do cadastro da matrícula: o próprio aluno (padrão) ou
 * outra pessoa/empresa (sacado). Com sacado, boleto/Pix saem em nome dele.
 * Emite o payload pronto (ou null = o próprio aluno) e se está válido.
 */
@Component({
  selector: "app-sacado-matricula",
  standalone: true,
  imports: [FormsModule, MatRadioModule],
  template: `
    <p class="text-xs font-medium text-gray-600 border-b pb-1 mb-3 mt-4">RESPONSÁVEL FINANCEIRO (SACADO)</p>
    <mat-radio-group [ngModel]="outro()" (ngModelChange)="alternar($event)" class="flex gap-6 mb-2">
      <mat-radio-button [value]="false">O próprio aluno</mat-radio-button>
      <mat-radio-button [value]="true">Outra pessoa ou empresa</mat-radio-button>
    </mat-radio-group>

    @if (outro()) {
      <div class="grid gap-3 md:grid-cols-4 items-end">
        <label class="text-sm">
          <span class="block text-xs text-gray-500">Tipo</span>
          <select class="border rounded px-2 py-1 w-full" [(ngModel)]="tipo" (ngModelChange)="mudou()">
            <option value="FISICA">Pessoa física</option>
            <option value="JURIDICA">Pessoa jurídica</option>
          </select>
        </label>
        <label class="text-sm">
          <span class="block text-xs text-gray-500">{{ tipo === "FISICA" ? "CPF" : "CNPJ" }}</span>
          <input
            class="border rounded px-2 py-1 w-full"
            inputmode="numeric"
            maxlength="18"
            [(ngModel)]="documento"
            (ngModelChange)="mudou()"
            (blur)="buscar()"
          />
        </label>
        <label class="text-sm md:col-span-2">
          <span class="block text-xs text-gray-500">{{ tipo === "FISICA" ? "Nome" : "Razão social" }}</span>
          <input class="border rounded px-2 py-1 w-full" [(ngModel)]="nome" (ngModelChange)="mudou()" [disabled]="existente()" />
        </label>
        <label class="text-sm">
          <span class="block text-xs text-gray-500">E-mail</span>
          <input class="border rounded px-2 py-1 w-full" type="email" [(ngModel)]="email" (ngModelChange)="mudou()" [disabled]="existente()" />
        </label>
        <label class="text-sm">
          <span class="block text-xs text-gray-500">Telefone</span>
          <input class="border rounded px-2 py-1 w-full" [(ngModel)]="telefone" (ngModelChange)="mudou()" [disabled]="existente()" />
        </label>
        @if (tipo === "FISICA") {
          <label class="text-sm">
            <span class="block text-xs text-gray-500">Data de nascimento</span>
            <input class="border rounded px-2 py-1 w-full" type="date" [(ngModel)]="dataNascimento" (ngModelChange)="mudou()" [disabled]="existente()" />
          </label>
        }
      </div>
      @if (existente()) {
        <p class="text-xs text-green-700 mt-1">Sacado já cadastrado — dados carregados.</p>
      }
      @if (erro()) {
        <p class="text-xs text-red-600 mt-1">{{ erro() }}</p>
      }
      <p class="text-xs text-gray-500 mt-1">
        Para consultar os títulos na área do aluno, pessoa física usa CPF + data de nascimento e empresa
        usa CNPJ + número da matrícula.
      </p>
    }
  `,
})
export class SacadoMatriculaComponent {
  private readonly service = inject(SacadosService);

  /** Payload do sacado (null = o próprio aluno) e se os dados estão completos/válidos. */
  readonly alterado = output<{ sacado: SacadoPayload | null; valido: boolean }>();

  readonly outro = signal(false);
  readonly existente = signal(false);
  readonly erro = signal("");

  tipo: TipoPessoaSacado = "FISICA";
  documento = "";
  nome = "";
  email = "";
  telefone = "";
  dataNascimento = "";

  alternar(outro: boolean): void {
    this.outro.set(outro);
    this.mudou();
  }

  private documentoValido(): boolean {
    return this.tipo === "FISICA" ? validarCpf(this.documento) : validarCnpj(this.documento);
  }

  /** Ao sair do documento: carrega o sacado já cadastrado com esse CPF/CNPJ. */
  buscar(): void {
    const digitos = normalizarCpf(this.documento);
    this.existente.set(false);
    if (!this.documentoValido()) return;
    this.documento = this.tipo === "FISICA" ? formatarCpf(digitos) : formatarCnpj(digitos);
    this.service.buscar(digitos).subscribe((lista: Sacado[]) => {
      const achado = lista.find((s) => s.cpfCnpj === digitos);
      if (!achado) return;
      this.tipo = achado.tipoPessoa;
      this.nome = achado.nome;
      this.email = achado.email ?? "";
      this.telefone = achado.telefone ?? "";
      this.dataNascimento = achado.dataNascimento ? achado.dataNascimento.substring(0, 10) : "";
      this.existente.set(true);
      this.mudou();
    });
  }

  mudou(): void {
    if (!this.outro()) {
      this.erro.set("");
      this.alterado.emit({ sacado: null, valido: true });
      return;
    }
    const temDocumento = normalizarCpf(this.documento).length > 0;
    this.erro.set(
      temDocumento && !this.documentoValido() ? (this.tipo === "FISICA" ? "CPF inválido" : "CNPJ inválido") : "",
    );
    const valido = this.documentoValido() && !!this.nome.trim();
    this.alterado.emit({
      valido,
      sacado: {
        tipoPessoa: this.tipo,
        cpfCnpj: normalizarCpf(this.documento),
        nome: this.nome.trim(),
        ...(this.email.trim() ? { email: this.email.trim() } : {}),
        ...(this.telefone.trim() ? { telefone: this.telefone.trim() } : {}),
        ...(this.tipo === "FISICA" && this.dataNascimento ? { dataNascimento: this.dataNascimento } : {}),
      },
    });
  }
}
