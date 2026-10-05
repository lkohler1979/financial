import { HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { Router } from "@angular/router";
import { catchError, throwError } from "rxjs";
import { AlunoAuthService } from "../auth/aluno-auth.service";
import { AuthService } from "../auth/auth.service";

// Sessão expirada/token inválido: desloga e volta para a tela de login da
// respectiva área (equipe ou aluno) — uma sessão expirar não derruba a outra.
export const authExpiradoInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const alunoAuth = inject(AlunoAuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((erro: HttpErrorResponse) => {
      const ehLogin = req.url.includes("/auth/login") || req.url.includes("/portal/login");
      if (erro.status === 401 && !ehLogin) {
        if (req.url.includes("/portal/")) {
          alunoAuth.logout();
          router.navigate(["/aluno/login"]);
        } else {
          authService.logout();
          router.navigate(["/login"]);
        }
      }
      return throwError(() => erro);
    }),
  );
};
