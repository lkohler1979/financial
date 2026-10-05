import { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { AlunoAuthService } from "../auth/aluno-auth.service";
import { AuthService } from "../auth/auth.service";

// Anexa o Bearer token a toda requisição para a API, exceto os logins (ainda
// não há token nesse momento). Chamadas de /portal usam o token do aluno; as
// demais, o da equipe — os dois nunca se misturam.
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes("/auth/login") || req.url.includes("/portal/login")) {
    return next(req);
  }

  const daAreaDoAluno = req.url.includes("/portal/");
  const token = daAreaDoAluno
    ? inject(AlunoAuthService).obterToken()
    : inject(AuthService).obterToken();
  if (!token) return next(req);

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
