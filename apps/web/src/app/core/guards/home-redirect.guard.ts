import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "../auth/auth.service";

// "/" não tem uma tela própria — decide para onde mandar o usuário conforme
// o perfil, já que /dashboard é exclusivo do ADMINISTRADOR (docs/PENDENCIAS.md).
export const homeRedirectGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.autenticado()) {
    router.navigate(["/login"]);
    return false;
  }

  const destino = authService.temPerfil("ADMINISTRADOR") ? "/dashboard" : "/matriculas";
  router.navigate([destino]);
  return false;
};
