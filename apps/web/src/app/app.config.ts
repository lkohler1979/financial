import { ApplicationConfig, provideZoneChangeDetection } from "@angular/core";
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
    provideHttpClient(
      withInterceptors([authTokenInterceptor, authExpiradoInterceptor, erroHttpInterceptor]),
    ),
  ],
};
