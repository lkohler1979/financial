// Utilidades de CPF no frontend (espelham a validação do backend em
// apps/api/src/shared/utils/cpf.ts).

export function normalizarCpf(valor: string): string {
  return (valor ?? "").replace(/\D/g, "");
}

export function validarCpf(valor: string): boolean {
  const cpf = normalizarCpf(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digitos = cpf.split("").map(Number);
  const calcularDigito = (qtd: number): number => {
    let soma = 0;
    for (let i = 0; i < qtd; i++) soma += digitos[i] * (qtd + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(9) === digitos[9] && calcularDigito(10) === digitos[10];
}

export function validarCnpj(valor: string): boolean {
  const cnpj = normalizarCpf(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digitos = cnpj.split("").map(Number);
  const calcular = (qtd: number): number => {
    const pesos =
      qtd === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const resto = pesos.reduce((acc, peso, i) => acc + digitos[i] * peso, 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calcular(12) === digitos[12] && calcular(13) === digitos[13];
}

export function formatarCnpj(valor: string): string {
  const cnpj = normalizarCpf(valor);
  if (cnpj.length !== 14) return valor;
  return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export function formatarCpf(valor: string): string {
  const cpf = normalizarCpf(valor);
  if (cpf.length !== 11) return valor;
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}
