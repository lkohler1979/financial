import { Component, inject, OnInit } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ConfiguracoesService } from "../../core/services/configuracoes.service";
import { MapeamentoImportacaoService } from "../../core/services/mapeamento-importacao.service";
import {
  AsaasAmbiente,
  AtualizarConfiguracaoPayload,
  FRASE_CONFIRMACAO_LIMPAR_BASE,
  FrequenciaImportacao,
  PagamentoProvedor,
  RedeAmbiente,
  TipoTituloProtesto,
} from "../../core/models/configuracao.model";
import {
  AcaoColunaAusente,
  CamposDisponiveisPorTabela,
  MapeamentoImportacao,
  TabelaDestinoImportacao,
} from "../../core/models/mapeamento-importacao.model";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "../../shared/components/confirm-dialog.component";

@Component({
  selector: "app-configuracoes",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatDialogModule,
  ],
  template: `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-medium m-0">Configurações</h1>
      <button mat-stroked-button type="button" (click)="carregar()" [disabled]="carregando">
        <mat-icon>refresh</mat-icon> Recarregar
      </button>
    </div>

    @if (carregando) {
      <mat-progress-bar mode="indeterminate" class="mb-3"></mat-progress-bar>
    }

    <form [formGroup]="form" (ngSubmit)="salvar()" class="space-y-5">
      <section class="bg-white rounded-lg border p-5">
        <p class="text-sm font-medium text-gray-700 mb-4">Importação e elegibilidade</p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <mat-form-field appearance="outline">
            <mat-label>Frequência de importação</mat-label>
            <mat-select formControlName="frequenciaImportacao">
              <mat-option value="MANUAL">Manual</mat-option>
              <mat-option value="SEMANAL">Semanal</mat-option>
              <mat-option value="MENSAL">Mensal</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Dias de atraso mínimo</mat-label>
            <input matInput type="number" min="0" formControlName="diasAtraso" />
            <mat-hint>Único critério para considerar uma parcela atrasada elegível.</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Gerar protesto com</mat-label>
            <mat-select formControlName="tipoTituloProtestoDefault">
              <mat-option value="AMBOS">Mensalidade e Renegociação</mat-option>
              <mat-option value="MENSALIDADE">Somente Mensalidade</mat-option>
              <mat-option value="RENEGOCIACAO">Somente Renegociação</mat-option>
            </mat-select>
            <mat-hint>Padrão pré-selecionado em /relatorios e na ficha de cobrança.</mat-hint>
          </mat-form-field>
        </div>
      </section>

      <section class="bg-white rounded-lg border p-5">
        <p class="text-sm font-medium text-gray-700 mb-4">Documentos Word</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <mat-form-field appearance="outline">
            <mat-label>Pasta de saída</mat-label>
            <input matInput formControlName="pastaSaidaDocumentos" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Modelo Word (.docx)</mat-label>
            <input matInput formControlName="modeloDocx" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="md:col-span-2">
            <mat-label>Padrão de nome de arquivo</mat-label>
            <input matInput formControlName="padraoNomeArquivo" />
            <mat-hint>Tokens disponíveis: {{ "{NOME}" }}, {{ "{CPF}" }}, {{ "{CURSO}" }}</mat-hint>
          </mat-form-field>
        </div>
      </section>

      <section class="bg-white rounded-lg border p-5">
        <p class="text-sm font-medium text-gray-700 mb-4">Multa e juros</p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
          <mat-form-field appearance="outline">
            <mat-label>Multa percentual</mat-label>
            <input matInput type="number" min="0" step="0.01" formControlName="multaPercentual" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Juros diário percentual</mat-label>
            <input
              matInput
              type="number"
              min="0"
              step="0.001"
              formControlName="jurosDiarioPercentual"
            />
          </mat-form-field>

          <div class="pt-3">
            <mat-checkbox formControlName="jurosContarDiaGeracao">
              Contar o dia da geração
            </mat-checkbox>
          </div>
        </div>
      </section>

      <section class="bg-white rounded-lg border p-5">
        <p class="text-sm font-medium text-gray-700 mb-1">Integração com sistema legado (Universa)</p>
        <p class="text-xs text-gray-500 mb-4">
          Credenciais usadas pelo botão "Sincronizar com sistema legado" (Ficha de Cobrança) e pela
          sincronização automática em lote. Deixe a senha em branco para manter a atual.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <mat-form-field appearance="outline">
            <mat-label>URL do sistema legado</mat-label>
            <input matInput formControlName="legadoUrl" placeholder="https://ethoson.universaeducacional.com.br" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Usuário</mat-label>
            <input matInput formControlName="legadoUsuario" autocomplete="off" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ legadoSenhaConfigurada ? "Nova senha (opcional)" : "Senha" }}</mat-label>
            <input matInput type="password" [formControl]="legadoSenhaControl" autocomplete="new-password" />
            @if (legadoSenhaConfigurada) {
              <mat-hint>Senha já configurada — preencha só para trocar.</mat-hint>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Intervalo da sincronização automática (horas)</mat-label>
            <input matInput type="number" min="1" formControlName="legadoIntervaloHoras" />
            <mat-hint>Ex.: 24 = uma vez ao dia, 1 = de hora em hora.</mat-hint>
          </mat-form-field>

          <div class="pt-3">
            <mat-checkbox formControlName="legadoSincronizacaoAtiva">
              Sincronização automática ativa
            </mat-checkbox>
          </div>
        </div>
      </section>

      <section class="bg-white rounded-lg border p-5">
        <p class="text-sm font-medium text-gray-700 mb-1">Integração Asaas</p>
        <p class="text-xs text-gray-500 mb-4">
          Credenciais usadas para gerar cobranças (boleto/Pix/cartão) na Ficha de Cobrança.
          Deixe a chave/token em branco para manter os atuais.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <mat-form-field appearance="outline">
            <mat-label>Ambiente</mat-label>
            <mat-select formControlName="asaasAmbiente">
              <mat-option value="SANDBOX">Sandbox</mat-option>
              <mat-option value="PRODUCAO">Produção</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ asaasApiKeyConfigurada ? "Nova chave (opcional)" : "Chave de API" }}</mat-label>
            <input matInput type="password" [formControl]="asaasApiKeyControl" autocomplete="new-password" />
            @if (asaasApiKeyConfigurada) {
              <mat-hint>Chave já configurada — preencha só para trocar.</mat-hint>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ asaasWebhookTokenConfigurado ? "Novo token (opcional)" : "Token do webhook" }}</mat-label>
            <input matInput type="password" [formControl]="asaasWebhookTokenControl" autocomplete="new-password" />
            @if (asaasWebhookTokenConfigurado) {
              <mat-hint>Token já configurado — preencha só para trocar.</mat-hint>
            }
          </mat-form-field>
        </div>

        <div class="mt-4 pt-4 border-t">
          <p class="text-sm text-gray-700 mb-1">Provedor por forma de pagamento</p>
          <p class="text-xs text-gray-500 mb-2">
            Qual integração processa cada forma de cobrança no menu "Gerar cobrança" da Ficha de
            Cobrança. "Desabilitado" remove a opção do menu. Cada forma só pode ter um provedor
            por vez.
          </p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Boleto</mat-label>
              <mat-select formControlName="provedorBoleto">
                <mat-option [value]="null">Desabilitado</mat-option>
                <mat-option value="ASAAS">Asaas</mat-option>
              </mat-select>
              <mat-hint>A Rede não oferece boleto.</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Pix</mat-label>
              <mat-select formControlName="provedorPix">
                <mat-option [value]="null">Desabilitado</mat-option>
                <mat-option value="ASAAS">Asaas</mat-option>
                <mat-option value="REDE">Rede</mat-option>
              </mat-select>
              @if (form.controls.provedorPix.value === "REDE") {
                <mat-hint>Pix pela Rede só funciona se o pagador tiver conta no Itaú.</mat-hint>
              }
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Cartão de crédito</mat-label>
              <mat-select formControlName="provedorCartao">
                <mat-option [value]="null">Desabilitado</mat-option>
                <mat-option value="ASAAS">Asaas</mat-option>
                <mat-option value="REDE">Rede</mat-option>
              </mat-select>
              @if (form.controls.provedorCartao.value === "REDE") {
                <mat-hint>
                  O aluno digita o cartão no portal; o número vai direto à Rede e nunca é gravado.
                </mat-hint>
              } @else {
                <mat-hint>Asaas: o aluno paga na fatura hospedada.</mat-hint>
              }
            </mat-form-field>
            @if (form.controls.provedorCartao.value === "REDE") {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Máx. de parcelas no cartão (Rede)</mat-label>
                <input matInput type="number" min="1" max="12" formControlName="redeCartaoMaxParcelas" />
                <mat-hint>1 = só à vista (a Rede aceita até 12x)</mat-hint>
              </mat-form-field>
            }
          </div>
        </div>

        <div class="mt-4 pt-4 border-t">
          <p class="text-sm text-gray-700 mb-1">Multa, juros e desconto por antecipação</p>
          <p class="text-xs text-gray-500 mb-2">
            Aplicados pelo Asaas em toda cobrança gerada. Deixe em branco para não enviar (mantém
            a configuração padrão da conta Asaas, se houver).
          </p>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Multa (%) após o vencimento</mat-label>
              <input matInput type="number" min="0" max="100" step="0.01" formControlName="asaasMultaPercentual" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Juros (% ao mês) após o vencimento</mat-label>
              <input
                matInput
                type="number"
                min="0"
                max="100"
                step="0.01"
                formControlName="asaasJurosMensalPercentual"
              />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Desconto (%) por antecipação</mat-label>
              <input
                matInput
                type="number"
                min="0"
                max="100"
                step="0.01"
                formControlName="asaasDescontoPercentual"
              />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Desconto válido até (dias antes do vencimento)</mat-label>
              <input
                matInput
                type="number"
                min="0"
                max="30"
                formControlName="asaasDescontoDiasAntesVencimento"
              />
              <mat-hint>Ex.: 5 = paga com desconto até 5 dias antes de vencer.</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Emitir cobrança automaticamente (dias antes do vencimento)</mat-label>
              <input matInput type="number" min="0" max="60" formControlName="emissaoAntecipadaDias" />
              <mat-hint>
                Todo dia, emite boleto/Pix das parcelas que vencem em até X dias e ainda não têm
                cobrança. 0 = desligado (só a pedido).
              </mat-hint>
            </mat-form-field>
          </div>
        </div>

        <p class="text-xs text-gray-500 mt-2">
          URL para cadastrar no painel do Asaas (Configurações → Webhooks):
          <code class="bg-gray-100 px-1 rounded">{{ asaasWebhookUrl }}</code>
        </p>
      </section>

      <section class="bg-white rounded-lg border p-5">
        <p class="text-sm font-medium text-gray-700 mb-1">Integração Rede (e.Rede/Itaú)</p>
        <p class="text-xs text-gray-500 mb-4">
          Credenciais da Rede — só Pix é suportado nesta integração. Deixe a chave/token em
          branco para manter os atuais.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <mat-form-field appearance="outline">
            <mat-label>Ambiente</mat-label>
            <mat-select formControlName="redeAmbiente">
              <mat-option value="SANDBOX">Sandbox</mat-option>
              <mat-option value="PRODUCAO">Produção</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ redePvConfigurado ? "Novo PV (opcional)" : "PV (número de filiação)" }}</mat-label>
            <input matInput type="password" [formControl]="redePvControl" autocomplete="new-password" />
            @if (redePvConfigurado) {
              <mat-hint>PV já configurado — preencha só para trocar.</mat-hint>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{
              redeChaveIntegracaoConfigurada ? "Nova chave (opcional)" : "Chave de integração"
            }}</mat-label>
            <input
              matInput
              type="password"
              [formControl]="redeChaveIntegracaoControl"
              autocomplete="new-password"
            />
            @if (redeChaveIntegracaoConfigurada) {
              <mat-hint>Chave já configurada — preencha só para trocar.</mat-hint>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{
              redeWebhookTokenConfigurado ? "Novo token (opcional)" : "Token do webhook"
            }}</mat-label>
            <input
              matInput
              type="password"
              [formControl]="redeWebhookTokenControl"
              autocomplete="new-password"
            />
            @if (redeWebhookTokenConfigurado) {
              <mat-hint>Token já configurado — preencha só para trocar.</mat-hint>
            }
          </mat-form-field>
        </div>

        <p class="text-xs text-gray-500 mt-2">
          URL para cadastrar no painel da Rede: <code class="bg-gray-100 px-1 rounded">{{ redeWebhookUrl }}</code>
          — em sandbox o cadastro é automático; em produção, repasse essa URL e o token acima
          pro suporte da Rede (eles cadastram manualmente, por CNPJ).
        </p>
      </section>

      <div class="flex justify-end">
        <button
          mat-raised-button
          color="primary"
          type="submit"
          [disabled]="form.invalid || salvando"
        >
          <mat-icon>save</mat-icon> Salvar configurações
        </button>
      </div>
    </form>

    <section class="bg-white rounded-lg border p-5 mt-5">
      <p class="text-sm font-medium text-gray-700 mb-1">Mapeamento de colunas da importação</p>
      <p class="text-xs text-gray-500 mb-4">
        Define, para cada coluna opcional da planilha, em qual tabela/campo o valor é gravado e o
        que fazer quando a coluna não existir no arquivo importado. As colunas estruturais (CPF,
        nome, curso, título, parcela, vencimento, valor) não são configuráveis aqui.
      </p>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-500 border-b">
              <th class="py-2 pr-2">Coluna da planilha</th>
              <th class="py-2 pr-2">Tabela</th>
              <th class="py-2 pr-2">Campo</th>
              <th class="py-2 pr-2">Se a coluna não existir</th>
              <th class="py-2 pr-2">Valor padrão</th>
              <th class="py-2 pr-2 text-center">Ativo</th>
              <th class="py-2"></th>
            </tr>
          </thead>
          <tbody>
            @for (linha of linhasMapeamento.controls; track linha; let i = $index) {
              <tr [formGroup]="linha" class="border-b last:border-0">
                <td class="py-2 pr-2">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="!w-40">
                    <input matInput formControlName="colunaPlanilha" />
                  </mat-form-field>
                </td>
                <td class="py-2 pr-2">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="!w-32">
                    <mat-select
                      formControlName="tabelaDestino"
                      (selectionChange)="aoTrocarTabela(linha)"
                    >
                      <mat-option value="ALUNO">Aluno</mat-option>
                      <mat-option value="MATRICULA">Matrícula</mat-option>
                      <mat-option value="PARCELA">Parcela</mat-option>
                    </mat-select>
                  </mat-form-field>
                </td>
                <td class="py-2 pr-2">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="!w-40">
                    <mat-select formControlName="campoDestino">
                      @for (campo of camposDaTabela(linha.value.tabelaDestino); track campo) {
                        <mat-option [value]="campo">{{ campo }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                </td>
                <td class="py-2 pr-2">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="!w-44">
                    <mat-select formControlName="acaoAusente">
                      <mat-option value="NAO_IMPORTAR">Não importar</mat-option>
                      <mat-option value="VALOR_PADRAO">Usar valor padrão</mat-option>
                    </mat-select>
                  </mat-form-field>
                </td>
                <td class="py-2 pr-2">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="!w-32">
                    <input
                      matInput
                      formControlName="valorPadrao"
                      [disabled]="linha.value.acaoAusente !== 'VALOR_PADRAO'"
                    />
                  </mat-form-field>
                </td>
                <td class="py-2 pr-2 text-center">
                  <mat-checkbox formControlName="ativo"></mat-checkbox>
                </td>
                <td class="py-2 whitespace-nowrap">
                  <button
                    mat-icon-button
                    type="button"
                    (click)="salvarMapeamento(i)"
                    aria-label="Salvar mapeamento"
                  >
                    <mat-icon>save</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    type="button"
                    color="warn"
                    (click)="removerMapeamento(i)"
                    aria-label="Remover mapeamento"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </td>
              </tr>
            }
            @if (linhasMapeamento.length === 0 && !carregandoMapeamentos) {
              <tr>
                <td colspan="7" class="text-gray-400 py-3">Nenhum mapeamento configurado.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div [formGroup]="novoMapeamento" class="flex flex-wrap items-end gap-2 mt-4 pt-4 border-t">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="!w-40">
          <mat-label>Coluna da planilha</mat-label>
          <input matInput formControlName="colunaPlanilha" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="!w-32">
          <mat-label>Tabela</mat-label>
          <mat-select formControlName="tabelaDestino" (selectionChange)="aoTrocarTabela(novoMapeamento)">
            <mat-option value="ALUNO">Aluno</mat-option>
            <mat-option value="MATRICULA">Matrícula</mat-option>
            <mat-option value="PARCELA">Parcela</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="!w-40">
          <mat-label>Campo</mat-label>
          <mat-select formControlName="campoDestino">
            @for (campo of camposDaTabela(novoMapeamento.value.tabelaDestino); track campo) {
              <mat-option [value]="campo">{{ campo }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="!w-44">
          <mat-label>Se a coluna não existir</mat-label>
          <mat-select formControlName="acaoAusente">
            <mat-option value="NAO_IMPORTAR">Não importar</mat-option>
            <mat-option value="VALOR_PADRAO">Usar valor padrão</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="!w-32">
          <mat-label>Valor padrão</mat-label>
          <input
            matInput
            formControlName="valorPadrao"
            [disabled]="novoMapeamento.value.acaoAusente !== 'VALOR_PADRAO'"
          />
        </mat-form-field>
        <button
          mat-stroked-button
          type="button"
          [disabled]="novoMapeamento.invalid"
          (click)="adicionarMapeamento()"
        >
          <mat-icon>add</mat-icon> Adicionar
        </button>
      </div>
    </section>

    <section class="bg-white rounded-lg border-2 border-red-200 p-5 mt-5">
      <p class="text-sm font-medium text-red-700 mb-1">Zona de risco</p>
      <p class="text-xs text-gray-500 mb-4">
        Apaga permanentemente todos os alunos, cursos, matrículas, parcelas, dados de cobrança e o
        histórico de relatórios (inclusive os documentos Word/PDF já gerados). Use antes de
        importar uma planilha real, para começar do zero. Usuários, configurações e o mapeamento
        de importação são mantidos. Esta ação não pode ser desfeita.
      </p>

      <mat-form-field appearance="outline" class="w-full max-w-md">
        <mat-label>Digite "{{ fraseConfirmacao }}" para habilitar o botão</mat-label>
        <input matInput [formControl]="confirmacaoLimpeza" autocomplete="off" />
      </mat-form-field>

      <div>
        <button
          mat-raised-button
          color="warn"
          type="button"
          [disabled]="confirmacaoLimpeza.value !== fraseConfirmacao || limpandoBase"
          (click)="confirmarLimpezaBase()"
        >
          <mat-icon>delete_forever</mat-icon> Limpar base de dados
        </button>
      </div>
    </section>
  `,
})
export class ConfiguracoesComponent implements OnInit {
  private readonly service = inject(ConfiguracoesService);
  private readonly mapeamentoService = inject(MapeamentoImportacaoService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);

  readonly fraseConfirmacao = FRASE_CONFIRMACAO_LIMPAR_BASE;
  readonly confirmacaoLimpeza = this.fb.nonNullable.control("");
  limpandoBase = false;

  readonly form = this.fb.nonNullable.group({
    frequenciaImportacao: this.fb.nonNullable.control<FrequenciaImportacao>("MANUAL"),
    diasAtraso: this.fb.nonNullable.control(90, [Validators.min(0)]),
    pastaSaidaDocumentos: this.fb.nonNullable.control("", [Validators.required]),
    modeloDocx: this.fb.nonNullable.control("", [Validators.required]),
    padraoNomeArquivo: this.fb.nonNullable.control("{NOME}_{CPF}_{CURSO}.docx", [
      Validators.required,
    ]),
    multaPercentual: this.fb.nonNullable.control(2, [Validators.min(0)]),
    jurosDiarioPercentual: this.fb.nonNullable.control(0.033, [Validators.min(0)]),
    jurosContarDiaGeracao: this.fb.nonNullable.control(true),
    tipoTituloProtestoDefault: this.fb.nonNullable.control<TipoTituloProtesto>("AMBOS"),
    legadoSincronizacaoAtiva: this.fb.nonNullable.control(false),
    legadoUrl: this.fb.nonNullable.control(""),
    legadoUsuario: this.fb.nonNullable.control(""),
    legadoIntervaloHoras: this.fb.nonNullable.control(24, [Validators.min(1)]),
    asaasAmbiente: this.fb.nonNullable.control<AsaasAmbiente>("SANDBOX"),
    asaasMultaPercentual: this.fb.control<number | null>(null),
    asaasJurosMensalPercentual: this.fb.control<number | null>(null),
    asaasDescontoPercentual: this.fb.control<number | null>(null),
    asaasDescontoDiasAntesVencimento: this.fb.control<number | null>(null),
    emissaoAntecipadaDias: this.fb.nonNullable.control(10, [Validators.min(0), Validators.max(60)]),
    provedorBoleto: this.fb.control<PagamentoProvedor | null>("ASAAS"),
    provedorPix: this.fb.control<PagamentoProvedor | null>("ASAAS"),
    provedorCartao: this.fb.control<PagamentoProvedor | null>("ASAAS"),
    redeCartaoMaxParcelas: this.fb.nonNullable.control(1, [Validators.min(1), Validators.max(12)]),
    redeAmbiente: this.fb.nonNullable.control<RedeAmbiente>("SANDBOX"),
  });

  /** Senha do sistema legado: nunca vem do backend — campo separado, só
   * enviado quando o admin digita algo (deixar em branco mantém a atual). */
  readonly legadoSenhaControl = this.fb.nonNullable.control("");
  legadoSenhaConfigurada = false;

  /** Chave de API e token do webhook do Asaas: nunca vêm do backend — campos
   * separados, só enviados quando o admin digita algo (mesmo padrão da senha
   * do sistema legado). */
  readonly asaasApiKeyControl = this.fb.nonNullable.control("");
  readonly asaasWebhookTokenControl = this.fb.nonNullable.control("");
  asaasApiKeyConfigurada = false;
  asaasWebhookTokenConfigurado = false;
  readonly asaasWebhookUrl = `${window.location.origin}/api/asaas/webhook`;

  /** Chave/PV e token do webhook da Rede: nunca vêm do backend — campos
   * separados, só enviados quando o admin digita algo (mesmo padrão do Asaas). */
  readonly redePvControl = this.fb.nonNullable.control("");
  readonly redeChaveIntegracaoControl = this.fb.nonNullable.control("");
  readonly redeWebhookTokenControl = this.fb.nonNullable.control("");
  redePvConfigurado = false;
  redeChaveIntegracaoConfigurada = false;
  redeWebhookTokenConfigurado = false;
  readonly redeWebhookUrl = `${window.location.origin}/api/rede/webhook`;

  carregando = false;
  salvando = false;

  camposDisponiveis: CamposDisponiveisPorTabela = { ALUNO: {}, MATRICULA: {}, PARCELA: {} };
  mapeamentos: MapeamentoImportacao[] = [];
  carregandoMapeamentos = false;

  readonly linhasMapeamento = this.fb.array<
    ReturnType<ConfiguracoesComponent["criarLinhaMapeamento"]>
  >([]);

  readonly novoMapeamento = this.fb.nonNullable.group({
    colunaPlanilha: ["", Validators.required],
    tabelaDestino: this.fb.nonNullable.control<TabelaDestinoImportacao>("ALUNO"),
    campoDestino: ["", Validators.required],
    acaoAusente: this.fb.nonNullable.control<AcaoColunaAusente>("NAO_IMPORTAR"),
    valorPadrao: [""],
  });

  ngOnInit(): void {
    this.carregar();
    this.carregarMapeamentos();
  }

  carregar(): void {
    this.carregando = true;
    this.service.obter().subscribe({
      next: (configuracao) => {
        this.form.patchValue({ ...configuracao, legadoUrl: configuracao.legadoUrl ?? "", legadoUsuario: configuracao.legadoUsuario ?? "" });
        this.legadoSenhaConfigurada = configuracao.legadoSenhaConfigurada;
        this.asaasApiKeyConfigurada = configuracao.asaasApiKeyConfigurada;
        this.asaasWebhookTokenConfigurado = configuracao.asaasWebhookTokenConfigurado;
        this.redePvConfigurado = configuracao.redePvConfigurado;
        this.redeChaveIntegracaoConfigurada = configuracao.redeChaveIntegracaoConfigurada;
        this.redeWebhookTokenConfigurado = configuracao.redeWebhookTokenConfigurado;
        this.carregando = false;
      },
      error: () => (this.carregando = false),
    });
  }

  salvar(): void {
    if (this.form.invalid) return;
    this.salvando = true;
    const valor = this.form.getRawValue();
    const novaSenha = this.legadoSenhaControl.value.trim();
    const novaChaveAsaas = this.asaasApiKeyControl.value.trim();
    const novoTokenAsaas = this.asaasWebhookTokenControl.value.trim();
    const novoPvRede = this.redePvControl.value.trim();
    const novaChaveRede = this.redeChaveIntegracaoControl.value.trim();
    const novoTokenRede = this.redeWebhookTokenControl.value.trim();
    const payload: AtualizarConfiguracaoPayload = {
      ...valor,
      legadoUrl: valor.legadoUrl.trim() || null,
      legadoUsuario: valor.legadoUsuario.trim() || null,
      ...(novaSenha ? { legadoSenha: novaSenha } : {}),
      ...(novaChaveAsaas ? { asaasApiKey: novaChaveAsaas } : {}),
      ...(novoTokenAsaas ? { asaasWebhookToken: novoTokenAsaas } : {}),
      ...(novoPvRede ? { redePv: novoPvRede } : {}),
      ...(novaChaveRede ? { redeChaveIntegracao: novaChaveRede } : {}),
      ...(novoTokenRede ? { redeWebhookToken: novoTokenRede } : {}),
    };

    this.service.atualizar(payload).subscribe({
      next: (configuracao) => {
        this.form.patchValue({ ...configuracao, legadoUrl: configuracao.legadoUrl ?? "", legadoUsuario: configuracao.legadoUsuario ?? "" });
        this.legadoSenhaConfigurada = configuracao.legadoSenhaConfigurada;
        this.legadoSenhaControl.setValue("");
        this.asaasApiKeyConfigurada = configuracao.asaasApiKeyConfigurada;
        this.asaasWebhookTokenConfigurado = configuracao.asaasWebhookTokenConfigurado;
        this.asaasApiKeyControl.setValue("");
        this.asaasWebhookTokenControl.setValue("");
        this.redePvConfigurado = configuracao.redePvConfigurado;
        this.redeChaveIntegracaoConfigurada = configuracao.redeChaveIntegracaoConfigurada;
        this.redeWebhookTokenConfigurado = configuracao.redeWebhookTokenConfigurado;
        this.redePvControl.setValue("");
        this.redeChaveIntegracaoControl.setValue("");
        this.redeWebhookTokenControl.setValue("");
        this.salvando = false;
        this.snackBar.open("Configurações salvas", "Fechar", { duration: 3000 });
      },
      error: () => (this.salvando = false),
    });
  }

  private criarLinhaMapeamento(mapeamento: MapeamentoImportacao) {
    return this.fb.nonNullable.group({
      colunaPlanilha: [mapeamento.colunaPlanilha, Validators.required],
      tabelaDestino: this.fb.nonNullable.control<TabelaDestinoImportacao>(
        mapeamento.tabelaDestino,
      ),
      campoDestino: [mapeamento.campoDestino, Validators.required],
      acaoAusente: this.fb.nonNullable.control<AcaoColunaAusente>(mapeamento.acaoAusente),
      valorPadrao: [mapeamento.valorPadrao ?? ""],
      ativo: this.fb.nonNullable.control(mapeamento.ativo),
    });
  }

  camposDaTabela(tabela: TabelaDestinoImportacao | undefined): string[] {
    if (!tabela) return [];
    return Object.keys(this.camposDisponiveis[tabela] ?? {});
  }

  aoTrocarTabela(grupo: { get(nome: string): { setValue(valor: string): void } | null }): void {
    grupo.get("campoDestino")?.setValue("");
  }

  carregarMapeamentos(): void {
    this.carregandoMapeamentos = true;
    this.mapeamentoService.camposDisponiveis().subscribe((campos) => {
      this.camposDisponiveis = campos;
    });
    this.mapeamentoService.listar().subscribe({
      next: (mapeamentos) => {
        this.mapeamentos = mapeamentos;
        this.linhasMapeamento.clear();
        mapeamentos.forEach((m) => this.linhasMapeamento.push(this.criarLinhaMapeamento(m)));
        this.carregandoMapeamentos = false;
      },
      error: () => (this.carregandoMapeamentos = false),
    });
  }

  adicionarMapeamento(): void {
    if (this.novoMapeamento.invalid) return;
    const valor = this.novoMapeamento.getRawValue();

    this.mapeamentoService
      .criar({
        colunaPlanilha: valor.colunaPlanilha,
        tabelaDestino: valor.tabelaDestino,
        campoDestino: valor.campoDestino,
        acaoAusente: valor.acaoAusente,
        valorPadrao: valor.acaoAusente === "VALOR_PADRAO" ? valor.valorPadrao || undefined : undefined,
        ativo: true,
      })
      .subscribe({
        next: () => {
          this.novoMapeamento.reset({
            colunaPlanilha: "",
            tabelaDestino: "ALUNO",
            campoDestino: "",
            acaoAusente: "NAO_IMPORTAR",
            valorPadrao: "",
          });
          this.snackBar.open("Mapeamento adicionado", "Fechar", { duration: 3000 });
          this.carregarMapeamentos();
        },
        error: (erro) => {
          const mensagem = erro?.error?.message ?? "Não foi possível adicionar o mapeamento";
          this.snackBar.open(mensagem, "Fechar", { duration: 4000 });
        },
      });
  }

  salvarMapeamento(indice: number): void {
    const linha = this.linhasMapeamento.at(indice);
    const mapeamento = this.mapeamentos[indice];
    if (!linha || !mapeamento || linha.invalid) return;
    const valor = linha.getRawValue();

    this.mapeamentoService
      .atualizar(mapeamento.id, {
        colunaPlanilha: valor.colunaPlanilha,
        tabelaDestino: valor.tabelaDestino,
        campoDestino: valor.campoDestino,
        acaoAusente: valor.acaoAusente,
        valorPadrao: valor.acaoAusente === "VALOR_PADRAO" ? valor.valorPadrao || undefined : undefined,
        ativo: valor.ativo,
      })
      .subscribe({
        next: () => {
          this.snackBar.open("Mapeamento salvo", "Fechar", { duration: 3000 });
          this.carregarMapeamentos();
        },
        error: (erro) => {
          const mensagem = erro?.error?.message ?? "Não foi possível salvar o mapeamento";
          this.snackBar.open(mensagem, "Fechar", { duration: 4000 });
        },
      });
  }

  removerMapeamento(indice: number): void {
    const mapeamento = this.mapeamentos[indice];
    if (!mapeamento) return;

    this.mapeamentoService.remover(mapeamento.id).subscribe(() => {
      this.snackBar.open("Mapeamento removido", "Fechar", { duration: 3000 });
      this.carregarMapeamentos();
    });
  }

  /** Segunda confirmação (além da frase digitada) antes de disparar a
   * limpeza — ação destrutiva e irreversível. */
  confirmarLimpezaBase(): void {
    if (this.confirmacaoLimpeza.value !== this.fraseConfirmacao) return;

    const data: ConfirmDialogData = {
      titulo: "Limpar base de dados",
      mensagem:
        "Tem certeza? Todos os alunos, cursos, matrículas, parcelas, dados de cobrança e o " +
        "histórico de relatórios (com os documentos já gerados) serão apagados permanentemente.",
      confirmarTexto: "Sim, limpar tudo",
    };

    this.dialog
      .open(ConfirmDialogComponent, { data, width: "480px" })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.limparBase();
      });
  }

  private limparBase(): void {
    this.limpandoBase = true;
    this.service.limparBase(this.confirmacaoLimpeza.value).subscribe({
      next: ({ contagens }) => {
        this.limpandoBase = false;
        this.confirmacaoLimpeza.setValue("");
        const total = Object.values(contagens).reduce((soma, valor) => soma + valor, 0);
        this.snackBar.open(`Base de dados limpa (${total} registros apagados)`, "Fechar", {
          duration: 6000,
        });
      },
      error: () => (this.limpandoBase = false),
    });
  }
}
