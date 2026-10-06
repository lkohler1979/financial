// Validações de cartão feitas ANTES de enviar à adquirente (poupam uma ida à
// Rede e evitam contar como tentativa um erro de digitação). Nada aqui grava
// nem registra o número do cartão.

/** Algoritmo de Luhn sobre os dígitos do número (já sem espaços/traços). */
export function luhnValido(numero: string): boolean {
  if (!/^\d{13,19}$/.test(numero)) return false;
  let soma = 0;
  let dobrar = false;
  for (let i = numero.length - 1; i >= 0; i--) {
    let digito = Number(numero[i]);
    if (dobrar) {
      digito *= 2;
      if (digito > 9) digito -= 9;
    }
    soma += digito;
    dobrar = !dobrar;
  }
  return soma % 10 === 0;
}

/** Validade (mês 1–12, ano com 4 dígitos) ainda não vencida — vale até o fim do mês. */
export function validadeNaoVencida(mes: number, ano: number, agora = new Date()): boolean {
  if (mes < 1 || mes > 12) return false;
  const fimDoMes = new Date(ano, mes, 0, 23, 59, 59);
  return fimDoMes.getTime() >= agora.getTime();
}

/** Nome do portador como a Rede espera: sem acentos nem caracteres especiais, até 30 chars. */
export function normalizarNomePortador(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
}

/**
 * Bandeira pelo número do cartão (a resposta da Rede não traz o nome). Só olha
 * o prefixo (BIN); nunca guarda nem repete o número.
 */
export function detectarBandeira(numero: string): string | null {
  const n = numero.replace(/\D/g, "");
  const prefixo = (len: number) => Number(n.slice(0, len));
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|5090|6277|6362|6363|650|6516|6550)/.test(n)) return "Elo";
  if (/^(606282|3841)/.test(n)) return "Hipercard";
  if (/^(637095|637568|637599|637609|637612)/.test(n)) return "Hiper";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(30[0-5]|36|38|39)/.test(n)) return "Diners";
  if (/^35(2[89]|[3-8])/.test(n)) return "JCB";
  if (/^4/.test(n)) return "Visa";
  if ((prefixo(2) >= 51 && prefixo(2) <= 55) || (prefixo(4) >= 2221 && prefixo(4) <= 2720)) return "Mastercard";
  return null;
}
