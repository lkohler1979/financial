import { ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { hashSenha } from "../../shared/utils/senha";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { usuariosRepository } from "./usuarios.repository";
import type { AlterarSenhaInput, AtualizarUsuarioInput, CriarUsuarioInput, ListarUsuariosInput } from "./usuarios.schema";

const ENTIDADE = "Usuario";

export const usuariosService = {
  async listar(params: ListarUsuariosInput) {
    const { page, pageSize, busca } = params;
    const { data, total } = await usuariosRepository.list({
      busca,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { data, total, page, pageSize };
  },

  async buscarPorId(id: string) {
    const usuario = await usuariosRepository.findByIdSeguro(id);
    if (!usuario) throw new NotFoundError("Usuário não encontrado");
    return usuario;
  },

  async criar(input: CriarUsuarioInput, usuarioIdAutor: string) {
    const existente = await usuariosRepository.findByEmail(input.email);
    if (existente) {
      throw new ConflictError("Já existe um usuário com este e-mail", { email: input.email });
    }

    const senhaHash = await hashSenha(input.senha);
    const usuario = await usuariosRepository.create({
      nome: input.nome,
      email: input.email,
      senhaHash,
      perfil: input.perfil,
    });

    await registrarAuditoria({
      usuarioId: usuarioIdAutor,
      entidade: ENTIDADE,
      entidadeId: usuario.id,
      acao: "CRIACAO",
      detalhes: { email: usuario.email, perfil: usuario.perfil },
    });

    return usuario;
  },

  async atualizar(id: string, input: AtualizarUsuarioInput, usuarioIdAutor: string) {
    await this.buscarPorId(id);

    const usuario = await usuariosRepository.update(id, input);

    await registrarAuditoria({
      usuarioId: usuarioIdAutor,
      entidade: ENTIDADE,
      entidadeId: usuario.id,
      acao: "ATUALIZACAO",
      detalhes: { camposAlterados: Object.keys(input) },
    });

    return usuario;
  },

  async alterarSenha(id: string, input: AlterarSenhaInput, usuarioIdAutor: string) {
    await this.buscarPorId(id);

    const senhaHash = await hashSenha(input.senha);
    await usuariosRepository.update(id, { senhaHash });

    await registrarAuditoria({
      usuarioId: usuarioIdAutor,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: "ATUALIZACAO",
      detalhes: { camposAlterados: ["senha"] },
    });
  },
};
