import { prisma } from "../database/prisma";
import { hashSenha } from "../shared/utils/senha";

// Script único para inserir/atualizar usuários específicos por e-mail.
// Rodar depois de `npm run build`: node dist/scripts/seed-usuarios.js
// Idempotente: upsert por email, então pode ser executado de novo (ex.: para
// trocar a senha de algum desses usuários).
const USUARIOS = [
  { nome: "Luiz Arlindo", email: "luizarlindo79@gmail.com", senha: "financ123" },
  { nome: "Elis Novaes", email: "elis.novaes@ethos.com.br", senha: "elis123" },
];

async function main(): Promise<void> {
  for (const { nome, email, senha } of USUARIOS) {
    const senhaHash = await hashSenha(senha);
    await prisma.usuario.upsert({
      where: { email },
      update: { senhaHash, nome, perfil: "ADMINISTRADOR", ativo: true },
      create: { nome, email, senhaHash, perfil: "ADMINISTRADOR", ativo: true },
    });
    console.log(`[seed-usuarios] usuário criado/atualizado: ${email}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (erro) => {
    console.error("[seed-usuarios] falhou:", erro);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
