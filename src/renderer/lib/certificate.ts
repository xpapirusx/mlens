/**
 * Minimal DER walk over an X.509 certificate — enough for the two things the
 * Secret views need: the expiry date (Radar's "Expires" column and the
 * certificate banner) and the subject/issuer common names.
 *
 * No crypto and no Node APIs: the renderer is sandboxed, and reading a date
 * out of a parsed structure does not need signature verification. Everything
 * here fails closed — a certificate that cannot be walked returns null and the
 * UI shows "–", never an invented date.
 */

export interface CertificateInfo {
  subjectCn?: string;
  issuerCn?: string;
  notBefore?: Date;
  notAfter?: Date;
}

interface Tlv {
  tag: number;
  contentStart: number;
  contentEnd: number;
  next: number;
}

function readTlv(bytes: Uint8Array, offset: number): Tlv | null {
  if (offset + 1 >= bytes.length) return null;
  const tag = bytes[offset];
  let position = offset + 1;
  const first = bytes[position];
  position += 1;
  let length: number;
  if (first < 0x80) {
    length = first;
  } else {
    const count = first & 0x7f;
    if (count === 0 || count > 4 || position + count > bytes.length) return null;
    length = 0;
    for (let index = 0; index < count; index += 1) {
      length = (length << 8) | bytes[position + index];
    }
    position += count;
  }
  const contentStart = position;
  const contentEnd = contentStart + length;
  if (contentEnd > bytes.length) return null;
  return { tag, contentStart, contentEnd, next: contentEnd };
}

/** UTCTime/GeneralizedTime → Date. Offsets other than Z are treated as UTC. */
function readTime(bytes: Uint8Array, tlv: Tlv): Date | null {
  const text = String.fromCharCode(...bytes.subarray(tlv.contentStart, tlv.contentEnd)).trim();
  const match = /^(\d{2,4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(text);
  if (!match) return null;
  let year = Number(match[1]);
  if (match[1].length === 2) year = year < 50 ? 2000 + year : 1900 + year;
  const value = Date.UTC(year, Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
  return Number.isFinite(value) ? new Date(value) : null;
}

/** First `2.5.4.3` (common name) inside an RDN sequence. */
function readCommonName(bytes: Uint8Array, name: Tlv): string | undefined {
  const oid2543 = [0x55, 0x04, 0x03];
  let set = readTlv(bytes, name.contentStart);
  while (set && set.contentStart < set.contentEnd) {
    if (set.tag === 0x31) {
      // SET → single AttributeTypeAndValue SEQ
      const attribute = readTlv(bytes, set.contentStart);
      if (attribute && attribute.tag === 0x30) {
        const type = readTlv(bytes, attribute.contentStart);
        const value = type ? readTlv(bytes, type.next) : null;
        if (
          type &&
          type.tag === 0x06 &&
          type.contentEnd - type.contentStart === oid2543.length &&
          oid2543.every((byte, index) => bytes[type.contentStart + index] === byte) &&
          value
        ) {
          const raw = String.fromCharCode(...bytes.subarray(value.contentStart, value.contentEnd)).replace(/\0+$/, "");
          if (raw) return raw;
        }
      }
    }
    set = readTlv(bytes, set.next);
  }
  return undefined;
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function pemBody(text: string): string | null {
  const match = /-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/.exec(text);
  return match ? match[1].replace(/\s+/g, "") : null;
}

function toBytes(value: string): Uint8Array | null {
  // The value may be PEM text, base64(DER), or base64(PEM text) — kubeconfigs
  // in the wild carry all three.
  const body = pemBody(value);
  if (body) return decodeBase64(body);

  const direct = decodeBase64(value.replace(/\s+/g, ""));
  if (!direct) return null;
  const head = String.fromCharCode(...direct.subarray(0, Math.min(direct.length, 64)));
  if (head.includes("-----BEGIN")) {
    const inner = pemBody(String.fromCharCode(...direct));
    if (inner) return decodeBase64(inner);
  }
  return direct;
}

export function parseCertificate(value: string): CertificateInfo | null {
  const bytes = toBytes(value);
  if (!bytes) return null;

  // Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signature }
  const certificate = readTlv(bytes, 0);
  if (!certificate || certificate.tag !== 0x30) return null;
  const tbs = readTlv(bytes, certificate.contentStart);
  if (!tbs || tbs.tag !== 0x30) return null;

  let tlv = readTlv(bytes, tbs.contentStart);
  if (!tlv) return null;
  if (tlv.tag === 0xa0) {
    // [0] explicit version
    tlv = readTlv(bytes, tlv.next);
    if (!tlv) return null;
  }
  // serialNumber INTEGER
  if (tlv.tag !== 0x02) return null;
  const signature = readTlv(bytes, tlv.next);
  if (!signature || signature.tag !== 0x30) return null;
  const issuer = readTlv(bytes, signature.next);
  if (!issuer || issuer.tag !== 0x30) return null;
  const validity = readTlv(bytes, issuer.next);
  if (!validity || validity.tag !== 0x30) return null;

  const notBeforeTlv = readTlv(bytes, validity.contentStart);
  const notAfterTlv = notBeforeTlv ? readTlv(bytes, notBeforeTlv.next) : null;
  if (!notBeforeTlv || !notAfterTlv) return null;

  const subject = readTlv(bytes, notAfterTlv.next);
  const info: CertificateInfo = {
    notBefore: readTime(bytes, notBeforeTlv) ?? undefined,
    notAfter: readTime(bytes, notAfterTlv) ?? undefined,
  };
  if (subject && subject.tag === 0x30) info.subjectCn = readCommonName(bytes, subject);
  info.issuerCn = readCommonName(bytes, issuer);
  return info;
}

/** Whole-day difference `target - now`, negative when already expired. */
export function daysUntil(date: Date | undefined, now = Date.now()): number | null {
  if (!date) return null;
  return Math.floor((date.getTime() - now) / 86_400_000);
}
