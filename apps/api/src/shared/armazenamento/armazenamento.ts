import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Armazenamento de arquivos (documentos de alunos). Hoje grava em pasta no
 * servidor; a interface é pequena de propósito para trocar por um storage
 * na nuvem (ex.: AWS S3) depois sem mexer nos módulos que a usam — decisão do
 * usuário, 2026-10-05.
 */
export interface Armazenamento {
  /** Grava o arquivo e devolve a chave opaca usada para ler/remover depois. */
  salvar(pasta: string, nomeOriginal: string, conteudo: Buffer): Promise<string>;
  /** Caminho absoluto no disco (só existe no armazenamento local). */
  caminho(chave: string): string;
  remover(chave: string): Promise<void>;
}

const RAIZ = path.resolve(process.cwd(), process.env.ARMAZENAMENTO_DIR ?? "output/documentos-alunos");

export const armazenamentoLocal: Armazenamento = {
  async salvar(pasta, nomeOriginal, conteudo) {
    const chave = path.posix.join(pasta, `${randomUUID()}${path.extname(nomeOriginal).toLowerCase()}`);
    const destino = path.join(RAIZ, chave);
    await fs.promises.mkdir(path.dirname(destino), { recursive: true });
    await fs.promises.writeFile(destino, conteudo);
    return chave;
  },

  caminho(chave) {
    const completo = path.resolve(RAIZ, chave);
    // Barra qualquer chave que tente sair da pasta raiz (path traversal).
    if (!completo.startsWith(RAIZ + path.sep)) throw new Error("Chave de arquivo inválida");
    return completo;
  },

  async remover(chave) {
    await fs.promises.rm(armazenamentoLocal.caminho(chave), { force: true });
  },
};

export const armazenamento: Armazenamento = armazenamentoLocal;
