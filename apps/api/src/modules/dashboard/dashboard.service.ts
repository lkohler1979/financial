import { dashboardRepository } from "./dashboard.repository";

export const dashboardService = {
  geral() {
    return dashboardRepository.geral();
  },

  cobranca() {
    return dashboardRepository.cobranca();
  },
};
