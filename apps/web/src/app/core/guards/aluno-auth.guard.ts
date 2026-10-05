import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AlunoAuthService } from "../auth/aluno-auth.service";

export const alunoAuthGuard: CanActivateFn = () => {
  const alunoAuth = inject(AlunoAuthService);
  const router = inject(Router);

  if (alunoAuth.autenticado()) return true;

  router.navigate(["/aluno/login"]);
  return false;
};
