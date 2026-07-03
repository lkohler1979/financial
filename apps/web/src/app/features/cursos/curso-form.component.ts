import { Component, inject, OnInit } from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar } from "@angular/material/snack-bar";
import { CursosService } from "../../core/services/cursos.service";
import { CursoPayload } from "../../core/models/curso.model";

@Component({
  selector: "app-curso-form",
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="flex items-center gap-2 mb-4">
      <a mat-icon-button routerLink="/cursos" aria-label="Voltar"
        ><mat-icon>arrow_back</mat-icon></a
      >
      <h1 class="text-2xl font-medium m-0">{{ editando ? "Editar curso" : "Novo curso" }}</h1>
    </div>

    @if (carregando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <form [formGroup]="form" (ngSubmit)="salvar()" class="bg-white rounded shadow-sm p-6 max-w-2xl">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4">
        <mat-form-field appearance="outline">
          <mat-label>Código</mat-label>
          <input matInput formControlName="codigo" />
          @if (form.controls.codigo.hasError("required")) {
            <mat-error>Código é obrigatório</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Nome</mat-label>
          <input matInput formControlName="nome" />
          @if (form.controls.nome.hasError("required")) {
            <mat-error>Nome é obrigatório</mat-error>
          }
        </mat-form-field>
      </div>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>Observações</mat-label>
        <textarea matInput formControlName="observacoes" rows="3"></textarea>
      </mat-form-field>

      <div class="my-2">
        <mat-slide-toggle formControlName="situacao">Curso ativo</mat-slide-toggle>
      </div>

      <div class="flex justify-end gap-2 mt-2">
        <a mat-button routerLink="/cursos">Cancelar</a>
        <button mat-raised-button color="primary" type="submit" [disabled]="salvando">
          Salvar
        </button>
      </div>
    </form>
  `,
})
export class CursoFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CursosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  editando = false;
  carregando = false;
  salvando = false;
  private id: string | null = null;

  readonly form = this.fb.nonNullable.group({
    codigo: ["", [Validators.required]],
    nome: ["", [Validators.required]],
    observacoes: [""],
    situacao: [true],
  });

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get("id");
    this.editando = !!this.id;

    if (this.editando && this.id) {
      this.carregando = true;
      this.service.buscarPorId(this.id).subscribe({
        next: (curso) => {
          this.form.patchValue({
            codigo: curso.codigo,
            nome: curso.nome,
            observacoes: curso.observacoes ?? "",
            situacao: curso.situacao,
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
    const payload: CursoPayload = {
      codigo: bruto.codigo,
      nome: bruto.nome,
      situacao: bruto.situacao,
      observacoes: bruto.observacoes || undefined,
    };

    const requisicao =
      this.editando && this.id
        ? this.service.atualizar(this.id, payload)
        : this.service.criar(payload);

    requisicao.subscribe({
      next: () => {
        this.snackBar.open("Curso salvo", "Fechar", { duration: 3000 });
        this.router.navigate(["/cursos"]);
      },
      error: () => (this.salvando = false),
    });
  }
}
