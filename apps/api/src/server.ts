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
