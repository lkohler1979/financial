import { SignedXml } from "xml-crypto";
import { AppError } from "../../../shared/errors/app-error";
import type { CertificadoA1 } from "./certificado";

const ALGORITMO_ASSINATURA = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const ALGORITMO_C14N = "http://www.w3.org/2001/10/xml-exc-c14n#";
const ALGORITMO_DIGEST = "http://www.w3.org/2001/04/xmlenc#sha256";
const TRANSFORM_ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

/**
 * Assina o elemento `elementoAssinado` (que precisa ter o atributo `Id`) e anexa a
 * `<Signature>` como último filho de `elementoRaiz` — padrão da NFS-e Nacional:
 * RSA-SHA256, c14n exclusiva, transformação enveloped, KeyInfo com o X509Certificate.
 */
export function assinarElemento(
  xml: string,
  certificado: CertificadoA1,
  elementoRaiz: string,
  elementoAssinado: string,
): string {
  const id = new RegExp(`<${elementoAssinado}\\b[^>]*\\bId="([^"]+)"`).exec(xml)?.[1];
  if (!id) throw new AppError(`Elemento <${elementoAssinado}> sem atributo Id — não dá para assinar`, 500, "NFSE_XML_SEM_ID");

  const assinatura = new SignedXml({
    privateKey: certificado.keyPem,
    publicCert: certificado.certPem,
    signatureAlgorithm: ALGORITMO_ASSINATURA,
    canonicalizationAlgorithm: ALGORITMO_C14N,
  });
  assinatura.addReference({
    xpath: `//*[local-name(.)='${elementoAssinado}']`,
    transforms: [TRANSFORM_ENVELOPED, ALGORITMO_C14N],
    digestAlgorithm: ALGORITMO_DIGEST,
    uri: `#${id}`,
  });
  assinatura.computeSignature(xml, {
    location: { reference: `//*[local-name(.)='${elementoRaiz}']`, action: "append" },
  });
  return assinatura.getSignedXml();
}

export const assinarDps = (xml: string, certificado: CertificadoA1) => assinarElemento(xml, certificado, "DPS", "infDPS");
