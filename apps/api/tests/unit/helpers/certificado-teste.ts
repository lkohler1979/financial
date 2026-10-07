import crypto from "node:crypto";
import forge from "node-forge";

/** Gera um .pfx autoassinado (formato do A1) para os testes — nunca vai para a produção. */
export function gerarPfxTeste(opcoes: { senha?: string; cn?: string; diasDeValidade?: number; inicio?: Date } = {}) {
  const senha = opcoes.senha ?? "senha-teste";
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const chave = forge.pki.privateKeyFromPem(privateKey.export({ type: "pkcs8", format: "pem" }) as string);
  const publica = forge.pki.setRsaPublicKey(chave.n, chave.e);

  const cert = forge.pki.createCertificate();
  cert.publicKey = publica;
  cert.serialNumber = "01";
  const inicio = opcoes.inicio ?? new Date(Date.now() - 86_400_000);
  cert.validity.notBefore = inicio;
  cert.validity.notAfter = new Date(inicio.getTime() + (opcoes.diasDeValidade ?? 365) * 86_400_000);
  const atributos = [{ name: "commonName", value: opcoes.cn ?? "EMPRESA TESTE LTDA:39279631000127" }];
  cert.setSubject(atributos);
  cert.setIssuer(atributos);
  cert.sign(chave, forge.md.sha256.create());

  const p12 = forge.pkcs12.toPkcs12Asn1(chave, [cert], senha, { algorithm: "3des" });
  const pfx = Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");
  return { pfx, senha, certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(chave) };
}
