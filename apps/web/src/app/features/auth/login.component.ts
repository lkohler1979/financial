import { Component, inject } from "@angular/core";
import { Router } from "@angular/router";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { AuthService } from "../../core/auth/auth.service";

// Senha: mínimo 6 caracteres, só letras e números (regra do usuário,
// 2026-07-07) — mesma regex usada no backend (auth.schema.ts).
const SENHA_REGEX = /^[a-zA-Z0-9]{6,}$/;

@Component({
  selector: "app-login",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <mat-card class="w-full max-w-sm">
        <mat-card-header>
          <mat-card-title class="text-xl font-medium">EthosFinancial</mat-card-title>
          <mat-card-subtitle>Entre com seu e-mail e senha</mat-card-subtitle>
        </mat-card-header>

        @if (entrando) {
          <mat-progress-bar mode="indeterminate"></mat-progress-bar>
        }

        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="entrar()" class="flex flex-col gap-1 pt-2">
            <mat-form-field appearance="outline">
              <mat-label>E-mail</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="username" />
              @if (form.controls.email.hasError("required")) {
                <mat-error>E-mail é obrigatório</mat-error>
              }
              @if (form.controls.email.hasError("email")) {
                <mat-error>Informe um e-mail válido</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Senha</mat-label>
              <input
                matInput
                type="password"
                formControlName="senha"
                autocomplete="current-password"
              />
              @if (form.controls.senha.hasError("required")) {
                <mat-error>Senha é obrigatória</mat-error>
              }
              @if (form.controls.senha.hasError("pattern")) {
                <mat-error>Mínimo 6 caracteres, apenas letras e números</mat-error>
              }
            </mat-form-field>

            @if (mensagemErro) {
              <p class="text-red-600 text-sm mb-2">{{ mensagemErro }}</p>
            }

            <button
              mat-raised-button
              color="primary"
              type="submit"
              class="w-full"
              [disabled]="entrando"
            >
              Entrar
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  entrando = false;
  mensagemErro = "";

  readonly form = this.fb.nonNullable.group({
    email: ["", [Validators.required, Validators.email]],
    senha: ["", [Validators.required, Validators.pattern(SENHA_REGEX)]],
  });

  entrar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.entrando = true;
    this.mensagemErro = "";

    this.authService.login(this.form.getRawValue()).subscribe({
      next: () => {
        this.router.navigate(["/"]);
      },
      error: (erro) => {
        this.entrando = false;
        this.mensagemErro = erro.error?.mensagem ?? "E-mail ou senha inválidos";
      },
    });
  }
}
