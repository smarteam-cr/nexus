/**
 * lib/external/politica-de-contrasena.ts — QUÉ CONTRASEÑA ACEPTA EL ENLACE EXTERNO.
 *
 * Auditoría 2026-09-03 (A-10): el CSE podía fijar una contraseña CUSTOM de 8 caracteres sin
 * ningún filtro —«smarteam2026», «clientex123», el nombre del proyecto— y eso vuelve inútiles al
 * bcrypt y al rate-limit que protegen la propuesta con precios y el cronograma del cliente: la
 * primera contraseña que prueba cualquiera con el enlace es el nombre que va en el asunto del
 * correo. Un solo lugar decide, y decide por MOTIVO (para que el mensaje al CSE diga qué
 * arreglar), no por un booleano.
 *
 * Las autogeneradas (12 del alfabeto sin ambiguos, ~71 bits) no pasan por acá: ya cumplen.
 */

export const LARGO_MINIMO_CONTRASENA = 12;
export const LARGO_MAXIMO_CONTRASENA = 64;

/**
 * Palabras que nunca son una contraseña, ni con hasta 4 caracteres pegados («smarteam2026»,
 * «password1234»). Lista corta a propósito: lo que un atacante prueba PRIMERO, no un diccionario.
 */
export const DICCIONARIO_PROHIBIDO: readonly string[] = [
  "password",
  "passw0rd",
  "contrasena",
  "contraseña",
  "clave",
  "secreto",
  "123456",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty",
  "qwertyuiop",
  "asdfgh",
  "abc123",
  "111111",
  "000000",
  "iloveyou",
  "letmein",
  "welcome",
  "bienvenido",
  "bienvenida",
  "admin",
  "administrador",
  "usuario",
  "cliente",
  "proyecto",
  "propuesta",
  "kickoff",
  "cronograma",
  "smarteam",
  "hubspot",
  "nexus",
  "costarica",
];

export type MotivoDeRechazo =
  | "corta"
  | "larga"
  | "espacios"
  | "diccionario"
  | "propia"
  | "repetitiva"
  | "secuencia";

export type VeredictoDeContrasena = { ok: true } | { ok: false; motivo: MotivoDeRechazo; mensaje: string };

/** Minúsculas, sin tildes, solo letras y dígitos: «Smart-Team_2026!» y «smarteam2026» son lo mismo. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const SECUENCIAS = [
  "0123456789012345678901234567890",
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuiopasdfghjklzxcvbnm",
];

/**
 * @param palabrasPropias nombres del proyecto y del cliente (con o sin separadores): una
 * contraseña que contenga cualquiera de sus palabras de 4+ letras se rechaza. Los trozos
 * puramente numéricos («2026» en «Sitio web 2026») no cuentan: rechazar un año sería ruido.
 */
export function evaluarContrasena(
  candidata: string,
  palabrasPropias: readonly string[] = [],
): VeredictoDeContrasena {
  if (candidata.length < LARGO_MINIMO_CONTRASENA) {
    return {
      ok: false,
      motivo: "corta",
      mensaje: `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`,
    };
  }
  if (candidata.length > LARGO_MAXIMO_CONTRASENA) {
    return {
      ok: false,
      motivo: "larga",
      mensaje: `La contraseña no puede pasar de ${LARGO_MAXIMO_CONTRASENA} caracteres.`,
    };
  }
  if (/\s/.test(candidata)) {
    return { ok: false, motivo: "espacios", mensaje: "La contraseña no puede tener espacios." };
  }

  const n = normalizar(candidata);

  for (const palabra of DICCIONARIO_PROHIBIDO) {
    const p = normalizar(palabra);
    if (p.length >= 4 && n.startsWith(p) && n.length - p.length <= 4) {
      return {
        ok: false,
        motivo: "diccionario",
        mensaje: "Esa contraseña es de las primeras que prueba cualquiera: elegí otra.",
      };
    }
  }

  for (const propia of palabrasPropias) {
    for (const trozo of propia.split(/[^\p{L}\p{N}]+/u)) {
      const t = normalizar(trozo);
      if (t.length >= 4 && !/^\d+$/.test(t) && n.includes(t)) {
        return {
          ok: false,
          motivo: "propia",
          mensaje: `La contraseña no puede llevar el nombre del cliente ni del proyecto («${trozo}»).`,
        };
      }
    }
  }

  if (new Set(n).size < 5) {
    return {
      ok: false,
      motivo: "repetitiva",
      mensaje: "La contraseña repite demasiado los mismos caracteres.",
    };
  }
  if (SECUENCIAS.some((s) => s.includes(n))) {
    return { ok: false, motivo: "secuencia", mensaje: "Una secuencia del teclado no es una contraseña." };
  }

  return { ok: true };
}
