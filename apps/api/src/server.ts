import "dotenv/config";
import { app } from "./app";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(PORT, () => {
  console.log(`[EthosFinancial API] rodando na porta ${PORT}`);
});
