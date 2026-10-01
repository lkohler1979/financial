// Define o fuso do processo Node antes de qualquer outro import — sistema é
// só para o Brasil (CPF, R$, datas de vencimento) e o host de produção nem
// sempre está configurado em America/Sao_Paulo (ex.: containers/VPS em UTC
// por padrão). Sem isso, `new Date(ano, mes, dia)` grava meia-noite UTC, que
// o navegador do usuário (UTC-3) exibe um dia antes do vencimento real.
process.env.TZ ||= "America/Sao_Paulo";

import "dotenv/config";
import { app } from "./app";
import { seedAdmin } from "./bootstrap/seed-admin";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

seedAdmin()
  .catch((err) => {
    console.error("[EthosFinancial API] falha ao garantir usuário administrador inicial", err);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`[EthosFinancial API] rodando na porta ${PORT}`);
    });
  });
