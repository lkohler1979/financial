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
