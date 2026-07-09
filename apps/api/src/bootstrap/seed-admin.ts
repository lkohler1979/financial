import { prisma } from "../database/prisma";
import { hashSenha } from "../shared/utils/senha";

// Garante que sempre exista ao menos um usuário ADMINISTRADOR ativo — sem
// isso ninguém conseguiria logar após uma instalação nova (não há tela de
// "criar conta", só a tela de login e a gestão de usuários, que exige
// ADMINISTRADOR). Credenciais vêm de ADMIN_EMAIL/ADMIN_PASSWORD (.env) e só
// são usadas nesta criação inicial — depois disso, a senha deve ser trocada
// pela própria tela de gestão de usuários.
export async function seedAdmin(): Promise<void> {
  const existeAdmin = await prisma.usuario.findFirst({
    where: { perfil: "ADMINISTRADOR", ativo: true },
  });
  if (existeAdmin) return;

  const email = process.env.ADMIN_EMAIL ?? "admin@ethosfinancial.local";
  const senha = process.env.ADMIN_PASSWORD ?? "admin123";

  const senhaHash = await hashSenha(senha);
  await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: {
      nome: "Administrador",
      email,
      senhaHash,
      perfil: "ADMINISTRADOR",
      ativo: true,
    },
  });

  console.log(`[EthosFinancial API] usuário administrador inicial criado: ${email}`);
}
