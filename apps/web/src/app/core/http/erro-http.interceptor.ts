import { HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { MatSnackBar } from "@angular/material/snack-bar";
import { catchError, throwError } from "rxjs";

// Interceptor funcional: exibe uma notificação amigável para erros da API,
// extraindo a mensagem padronizada retornada pelo backend.
export const erroHttpInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);

  return next(req).pipe(
    catchError((erro: HttpErrorResponse) => {
      const exibir = (corpo: { mensagem?: string; detalhes?: unknown } | null | undefined) => {
        const mensagem =
          corpo?.mensagem ??
          (erro.status === 0 ? "Não foi possível conectar à API" : "Ocorreu um erro inesperado");

        const detalhe = Array.isArray(corpo?.detalhes)
          ? corpo.detalhes
              .map((d: { campo?: string; mensagem?: string }) =>
                d.campo ? `${d.campo}: ${d.mensagem}` : d.mensagem,
              )
              .join(" · ")
          : "";

        snackBar.open(detalhe ? `${mensagem} (${detalhe})` : mensagem, "Fechar", {
          duration: 6000,
          panelClass: "snack-erro",
        });
      };

      // Em downloads (responseType: blob) o corpo do erro também chega como Blob: lê o JSON.
      if (erro.error instanceof Blob) {
        erro.error
          .text()
          .then((texto) => exibir(JSON.parse(texto)))
          .catch(() => exibir(null));
      } else {
        exibir(erro.error);
      }

      return throwError(() => erro);
    }),
  );
};
