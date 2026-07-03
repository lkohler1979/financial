// Erros de aplicação com status HTTP associado. O error-handler central
// traduz estas exceções para respostas JSON consistentes.

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly codigo: string;
  public readonly detalhes?: unknown;

  constructor(mensagem: string, statusCode = 400, codigo = "ERRO", detalhes?: unknown) {
    super(mensagem);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.codigo = codigo;
    this.detalhes = detalhes;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class NotFoundError extends AppError {
  constructor(mensagem = "Recurso não encontrado") {
    super(mensagem, 404, "NAO_ENCONTRADO");
  }
}

export class ConflictError extends AppError {
  constructor(mensagem = "Conflito de recurso", detalhes?: unknown) {
    super(mensagem, 409, "CONFLITO", detalhes);
  }
}

export class ValidationError extends AppError {
  constructor(mensagem = "Dados inválidos", detalhes?: unknown) {
    super(mensagem, 422, "VALIDACAO", detalhes);
  }
}
