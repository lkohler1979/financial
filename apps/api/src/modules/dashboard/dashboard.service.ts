import { dashboardRepository } from "./dashboard.repository";
import { dashboardVisaoRepository } from "./dashboard-visao.repository";

export const dashboardService = {
  visaoGeral() {
    return dashboardVisaoRepository.visaoGeral();
  },

  geral() {
    return dashboardRepository.geral();
  },

  cobranca() {
    return dashboardRepository.cobranca();
  },
};
