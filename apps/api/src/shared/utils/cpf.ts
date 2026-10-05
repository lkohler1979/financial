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

/**
 * Valida um CNPJ pelos dígitos verificadores (com ou sem máscara).
 * Rejeita tamanho errado e sequências repetidas.
 */
export function validarCnpj(valor: string): boolean {
  const cnpj = normalizarCpf(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digitos = cnpj.split("").map(Number);
  const calcular = (qtd: number): number => {
    const pesos =
      qtd === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, peso, i) => acc + digitos[i] * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calcular(12) === digitos[12] && calcular(13) === digitos[13];
}

/** Formata um CPF (11 dígitos) na máscara 000.000.000-00. */
export function formatarCpf(valor: string): string {
  const cpf = normalizarCpf(valor);
  if (cpf.length !== 11) return valor;
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}
