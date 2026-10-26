import { Component } from "@angular/core";

/** Marca do Ethos Financial (folha em verde-azulado) + nome. */
@Component({
  selector: "app-logo",
  standalone: true,
  template: `
    <span class="inline-flex items-center gap-2.5">
      <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true">
        <path d="M20 3c9 4 14 12 13 21-1 8-7 13-13 13S8 32 7 24C6 15 11 7 20 3z" fill="#0b837e" />
        <path
          d="M20 11c-3.5 3.2-6 7.5-6 12 0 5 3.2 9.5 6 13 2.8-3.5 6-8 6-13 0-4.5-2.5-8.8-6-12z"
          fill="#bfe8e3"
        />
      </svg>
      <span class="text-[22px] font-semibold tracking-tight text-ink">Ethos Financial</span>
    </span>
  `,
})
export class LogoComponent {}
