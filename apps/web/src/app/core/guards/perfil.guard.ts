import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "../auth/auth.service";
import { Perfil } from "../models/auth.model";

// Uso: { path: "...", canActivate: [perfilGuard], data: { perfis: ["ADMINISTRADOR"] } }
export const perfilGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const perfis = route.data["perfis"] as Perfil[] | undefined;
  if (!perfis || perfis.length === 0 || authService.temPerfil(...perfis)) return true;

  // Não usa "/" para evitar loop com o homeRedirectGuard: manda direto para
  // uma tela que o perfil atual sempre pode acessar.
  router.navigate([authService.temPerfil("ADMINISTRADOR") ? "/dashboard" : "/matriculas"]);
  return false;
};
