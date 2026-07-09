import { HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { Router } from "@angular/router";
import { catchError, throwError } from "rxjs";
import { AuthService } from "../auth/auth.service";

// Sessão expirada/token inválido: desloga e volta para a tela de login.
export const authExpiradoInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((erro: HttpErrorResponse) => {
      if (erro.status === 401 && !req.url.includes("/auth/login")) {
        authService.logout();
        router.navigate(["/login"]);
      }
      return throwError(() => erro);
    }),
  );
};
