/**
 * Limite de tentativas falhas por chave dentro de uma janela de tempo, em
 * memória (reinicia com o processo — suficiente para uma única instância da
 * API). Usado contra força bruta em login e contra robôs testando cartões.
 */
export class LimitadorTentativas {
  private readonly falhas = new Map<string, { quantidade: number; desde: number }>();

  constructor(
    private readonly maximo: number,
    private readonly janelaMs: number,
  ) {}

  bloqueado(chave: string, agora = Date.now()): boolean {
    const f = this.falhas.get(chave);
    if (!f) return false;
    if (agora - f.desde > this.janelaMs) {
      this.falhas.delete(chave);
      return false;
    }
    return f.quantidade >= this.maximo;
  }

  registrarFalha(chave: string, agora = Date.now()): void {
    const f = this.falhas.get(chave);
    if (!f || agora - f.desde > this.janelaMs) this.falhas.set(chave, { quantidade: 1, desde: agora });
    else f.quantidade += 1;
  }

  limpar(chave?: string): void {
    if (chave) this.falhas.delete(chave);
    else this.falhas.clear();
  }
}
