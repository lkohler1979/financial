// Utilidades de CPF — o CPF é a chave única do Aluno (PRD seção 7).

/** Remove qualquer caractere que não seja dígito. */
export function normalizarCpf(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Valida um CPF pelo algoritmo dos dígitos verificadores.
 * Aceita CPF com ou sem máscara; retorna false para sequências repetidas
 * (ex.: 00000000000) e tamanhos inválidos.
 */
export function validarCpf(valor: string): boolean {
  const cpf = normalizarCpf(valor);

  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digitos = cpf.split("").map(Number);

  const calcularDigito = (qtd: number): number => {
    let soma = 0;
    for (let i = 0; i < qtd; i++) {
      soma += digitos[i] * (qtd + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(9) === digitos[9] && calcularDigito(10) === digitos[10];
}

/** Formata um CPF (11 dígitos) na máscara 000.000.000-00. */
export function formatarCpf(valor: string): string {
  const cpf = normalizarCpf(valor);
  if (cpf.length !== 11) return valor;
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}
