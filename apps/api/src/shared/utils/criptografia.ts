import crypto from "node:crypto";

// Criptografia reversível (AES-256-GCM) para segredos que o backend precisa
// reler em texto puro (ex.: senha do sistema legado usada para autenticar
// chamadas HTTP) — diferente de hashSenha (bcrypt, one-way, senha de login).
// A chave vem de variável de ambiente, nunca do banco.
const ALGORITMO = "aes-256-gcm";

function obterChave(): Buffer {
  const segredo = process.env.LEGADO_CREDENCIAIS_SECRET;
  if (!segredo) {
    throw new Error(
      "LEGADO_CREDENCIAIS_SECRET não configurado (.env) — necessário para criptografar/decifrar credenciais do sistema legado",
    );
  }
  return crypto.createHash("sha256").update(segredo).digest();
}

/** Retorna "iv:authTag:cipherText", tudo em hex, num único texto persistível. */
export function criptografar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv(ALGORITMO, obterChave(), iv);
  const cifrado = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  const authTag = cifra.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), cifrado.toString("hex")].join(":");
}

export function decifrar(valor: string): string {
  const [ivHex, authTagHex, cifradoHex] = valor.split(":");
  if (!ivHex || !authTagHex || !cifradoHex) {
    throw new Error("Valor criptografado em formato inválido");
  }

  const decifra = crypto.createDecipheriv(ALGORITMO, obterChave(), Buffer.from(ivHex, "hex"));
  decifra.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decifrado = Buffer.concat([decifra.update(Buffer.from(cifradoHex, "hex")), decifra.final()]);
  return decifrado.toString("utf8");
}
