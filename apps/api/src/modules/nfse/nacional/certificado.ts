import forge from "node-forge";
import { ValidationError } from "../../../shared/errors/app-error";

/** Certificado digital A1 (arquivo .pfx) já aberto: chave e certificado em PEM. */
export interface CertificadoA1 {
  keyPem: string;
  certPem: string;
  /** Nome no certificado (CN), ex.: "INSTITUTO ETHOS EDUCACAO DIGITAL LTDA:39279631000127". */
  titular: string;
  /** CNPJ lido do CN do certificado (padrão ICP-Brasil); null se não constar. */
  cnpj: string | null;
  validoDe: Date;
  validoAte: Date;
}

const MENSAGEM_ARQUIVO_OU_SENHA = "Não foi possível abrir o certificado. Confira se é um arquivo .pfx/.p12 (A1) e se a senha está correta.";

/**
 * Abre um .pfx e devolve chave/certificado em PEM. Valida a senha e a validade: um
 * certificado vencido é recusado já no cadastro, em vez de falhar na hora de emitir.
 */
export function lerCertificadoA1(pfx: Buffer, senha: string, agora = new Date()): CertificadoA1 {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const der = forge.util.createBuffer(pfx.toString("binary"));
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), senha);
  } catch {
    throw new ValidationError(MENSAGEM_ARQUIVO_OU_SENHA);
  }

  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const chave = chaves.map((b) => b.key).find((k): k is forge.pki.rsa.PrivateKey => Boolean(k));
  const certificados = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c));
  if (!chave || certificados.length === 0) {
    throw new ValidationError("O arquivo não contém chave privada e certificado. Envie o certificado A1 completo (.pfx).");
  }

  // O .pfx pode trazer a cadeia (AC intermediárias): usa o certificado cuja chave pública
  // bate com a chave privada.
  const certificado =
    certificados.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n.compareTo(chave.n) === 0) ?? certificados[0];

  const validoDe = certificado.validity.notBefore;
  const validoAte = certificado.validity.notAfter;
  if (validoAte.getTime() < agora.getTime()) {
    throw new ValidationError(`Certificado vencido em ${validoAte.toLocaleDateString("pt-BR")}. Envie um certificado válido.`);
  }
  if (validoDe.getTime() > agora.getTime()) {
    throw new ValidationError("Certificado ainda não está válido (data de início no futuro).");
  }

  const titular = String(certificado.subject.getField("CN")?.value ?? "");
  return {
    keyPem: forge.pki.privateKeyToPem(chave),
    certPem: forge.pki.certificateToPem(certificado),
    titular,
    cnpj: /:(\d{14})\b/.exec(titular)?.[1] ?? null,
    validoDe,
    validoAte,
  };
}
