import { Component, inject, OnInit } from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar } from "@angular/material/snack-bar";
import { UsuariosService } from "../../core/services/usuarios.service";
import { Perfil } from "../../core/models/auth.model";

// Mesma regra do backend (auth.schema.ts): mínimo 6 caracteres alfanuméricos.
const SENHA_REGEX = /^[a-zA-Z0-9]{6,}$/;

const PERFIS: { valor: Perfil; rotulo: string }[] = [
  { valor: "ADMINISTRADOR", rotulo: "Administrador — acesso irrestrito" },
  { valor: "FINANCEIRO", rotulo: "Financeiro — cursos, alunos, matrículas, importação e relatórios" },
  { valor: "USUARIO", rotulo: "Usuário — alunos, matrículas e relatórios" },
];

@Component({
  selector: "app-usuario-form",
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="flex items-center gap-2 mb-4">
      <a mat-icon-button routerLink="/usuarios" aria-label="Voltar"
        ><mat-icon>arrow_back</mat-icon></a
      >
      <h1 class="text-2xl font-medium m-0">{{ editando ? "Editar usuário" : "Novo usuário" }}</h1>
    </div>

    @if (carregando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <form [formGroup]="form" (ngSubmit)="salvar()" class="bg-white rounded shadow-sm p-6 max-w-2xl">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4">
        <mat-form-field appearance="outline">
          <mat-label>Nome</mat-label>
          <input matInput formControlName="nome" />
          @if (form.controls.nome.hasError("required")) {
            <mat-error>Nome é obrigatório</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>E-mail</mat-label>
          <input matInput type="email" formControlName="email" [readonly]="editando" />
          @if (form.controls.email.hasError("required")) {
            <mat-error>E-mail é obrigatório</mat-error>
          }
          @if (form.controls.email.hasError("email")) {
            <mat-error>Informe um e-mail válido</mat-error>
          }
        </mat-form-field>
      </div>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>Perfil</mat-label>
        <mat-select formControlName="perfil">
          @for (p of perfis; track p.valor) {
            <mat-option [value]="p.valor">{{ p.rotulo }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>{{ editando ? "Nova senha (opcional)" : "Senha" }}</mat-label>
        <input matInput type="password" formControlName="senha" autocomplete="new-password" />
        @if (form.controls.senha.hasError("pattern")) {
          <mat-error>Mínimo 6 caracteres, apenas letras e números</mat-error>
        }
      </mat-form-field>

      @if (editando) {
        <div class="my-2">
          <mat-slide-toggle formControlName="ativo">Usuário ativo</mat-slide-toggle>
        </div>
      }

      <div class="flex justify-end gap-2 mt-2">
        <a mat-button routerLink="/usuarios">Cancelar</a>
        <button mat-raised-button color="primary" type="submit" [disabled]="salvando">
          Salvar
        </button>
      </div>
    </form>
  `,
})
export class UsuarioFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(UsuariosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly perfis = PERFIS;
  editando = false;
  carregando = false;
  salvando = false;
  private id: string | null = null;

  readonly form = this.fb.nonNullable.group({
    nome: ["", [Validators.required]],
    email: ["", [Validators.required, Validators.email]],
    perfil: ["USUARIO" as Perfil, [Validators.required]],
    senha: ["", [Validators.pattern(SENHA_REGEX)]],
    ativo: [true],
  });

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get("id");
    this.editando = !!this.id;

    if (this.editando) {
      // Ao editar, senha passa a ser opcional (só troca se preenchida).
      this.form.controls.senha.clearValidators();
      this.form.controls.senha.setValidators([Validators.pattern(SENHA_REGEX)]);
      this.form.controls.senha.updateValueAndValidity();
    } else {
      this.form.controls.senha.setValidators([Validators.required, Validators.pattern(SENHA_REGEX)]);
    }

    if (this.editando && this.id) {
      this.carregando = true;
      this.service.buscarPorId(this.id).subscribe({
        next: (usuario) => {
          this.form.patchValue({
            nome: usuario.nome,
            email: usuario.email,
            perfil: usuario.perfil,
            ativo: usuario.ativo,
          });
          this.carregando = false;
        },
        error: () => (this.carregando = false),
      });
    }
  }

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.salvando = true;
    const bruto = this.form.getRawValue();

    if (this.editando && this.id) {
      this.service
        .atualizar(this.id, { nome: bruto.nome, perfil: bruto.perfil, ativo: bruto.ativo })
        .subscribe({
          next: () => this.finalizarComSenhaOpcional(this.id as string, bruto.senha),
          error: () => (this.salvando = false),
        });
      return;
    }

    this.service
      .criar({ nome: bruto.nome, email: bruto.email, senha: bruto.senha, perfil: bruto.perfil })
      .subscribe({
        next: () => {
          this.snackBar.open("Usuário criado", "Fechar", { duration: 3000 });
          this.router.navigate(["/usuarios"]);
        },
        error: () => (this.salvando = false),
      });
  }

  private finalizarComSenhaOpcional(id: string, senha: string): void {
    if (!senha) {
      this.snackBar.open("Usuário salvo", "Fechar", { duration: 3000 });
      this.router.navigate(["/usuarios"]);
      return;
    }

    this.service.alterarSenha(id, senha).subscribe({
      next: () => {
        this.snackBar.open("Usuário salvo", "Fechar", { duration: 3000 });
        this.router.navigate(["/usuarios"]);
      },
      error: () => (this.salvando = false),
    });
  }
}
