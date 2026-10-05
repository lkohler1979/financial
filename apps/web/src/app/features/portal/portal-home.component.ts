import { Component, inject, OnInit, signal } from "@angular/core";
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTabsModule } from "@angular/material/tabs";
import { MatToolbarModule } from "@angular/material/toolbar";
import { AlunoAuthService } from "../../core/auth/aluno-auth.service";
import { PortalMe } from "../../core/models/portal.model";
import { PortalService } from "../../core/services/portal.service";
import { PortalDocumentosComponent } from "./portal-documentos.component";
import { PortalPagamentosComponent } from "./portal-pagamentos.component";
import { PortalSolicitacoesComponent } from "./portal-solicitacoes.component";

/** Casca da área do aluno: dados dele + abas Documentos / Pagamentos / Solicitações. */
@Component({
  selector: "app-portal-home",
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatToolbarModule,
    PortalDocumentosComponent,
    PortalPagamentosComponent,
    PortalSolicitacoesComponent,
  ],
  template: `
    <mat-toolbar color="primary">
      <span class="font-medium">Área do aluno</span>
      <span class="flex-1"></span>
      <span class="text-sm mr-3 hidden sm:inline">{{ alunoAuth.aluno()?.nome }}</span>
      <button mat-icon-button aria-label="Sair" (click)="sair()">
        <mat-icon>logout</mat-icon>
      </button>
    </mat-toolbar>

    <div class="max-w-5xl mx-auto p-3 sm:p-6">
      @if (me(); as dados) {
        <p class="text-sm text-gray-600 mb-3">
          @if (dados.tipoAcesso === "ALUNO") {
            Código do aluno <strong>{{ dados.aluno.codigo ?? "—" }}</strong>
          } @else {
            Responsável financeiro: <strong>{{ dados.aluno.nome }}</strong>
          }
        </p>
        @if (dados.matriculas.length === 0) {
          <p class="text-gray-500">Você ainda não tem matrícula registrada.</p>
        } @else {
          <mat-tab-group animationDuration="0ms">
            @if (dados.tipoAcesso === "ALUNO") {
              <mat-tab label="Documentos">
                <div class="pt-4">
                  <app-portal-documentos [matriculas]="dados.matriculas"></app-portal-documentos>
                </div>
              </mat-tab>
            }
            <mat-tab label="Pagamentos">
              <div class="pt-4">
                <app-portal-pagamentos [matriculas]="dados.matriculas"></app-portal-pagamentos>
              </div>
            </mat-tab>
            @if (dados.tipoAcesso === "ALUNO") {
              <mat-tab label="Solicitações">
                <div class="pt-4">
                  <app-portal-solicitacoes [matriculas]="dados.matriculas"></app-portal-solicitacoes>
                </div>
              </mat-tab>
            }
          </mat-tab-group>
        }
      } @else {
        <p class="text-gray-500">Carregando...</p>
      }
    </div>
  `,
})
export class PortalHomeComponent implements OnInit {
  readonly alunoAuth = inject(AlunoAuthService);
  private readonly portal = inject(PortalService);
  private readonly router = inject(Router);

  readonly me = signal<PortalMe | null>(null);

  ngOnInit(): void {
    this.portal.me().subscribe((dados) => this.me.set(dados));
  }

  sair(): void {
    this.alunoAuth.logout();
    this.router.navigate(["/aluno/login"]);
  }
}
