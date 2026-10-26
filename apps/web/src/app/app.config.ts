import {
  APP_INITIALIZER,
  ApplicationConfig,
  inject,
  provideZoneChangeDetection,
} from "@angular/core";
import { MatIconRegistry } from "@angular/material/icon";
import { provideRouter } from "@angular/router";
import { provideAnimations } from "@angular/platform-browser/animations";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { routes } from "./app.routes";
import { erroHttpInterceptor } from "./core/http/erro-http.interceptor";
import { authTokenInterceptor } from "./core/http/auth-token.interceptor";
import { authExpiradoInterceptor } from "./core/http/auth-expirado.interceptor";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimations(),
    // Ícones no estilo "outlined" do padrão visual (docs/especificacao).
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => {
        const registro = inject(MatIconRegistry);
        return () => registro.setDefaultFontSetClass("material-icons-outlined");
      },
    },
    provideHttpClient(
      withInterceptors([authTokenInterceptor, authExpiradoInterceptor, erroHttpInterceptor]),
    ),
  ],
};
