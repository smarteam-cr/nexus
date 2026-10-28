/**
 * lib/tests-diagnostico/limite.ts — PROTECCIÓN CONTRA ABUSO del test público (O1 etapa 1, 2026-10-26). PURO (estado en
 * memoria del proceso).
 *
 * El test no tiene sesión: cualquiera puede empezarlo. Lo que se cuida es que un script no llene la base ni HubSpot de
 * leads falsos:
 *   · por dirección (el hash de la IP, nunca la IP): hasta `POR_IP_POR_HORA` intentos nuevos por hora;
 *   · en total: hasta `TOTAL_POR_HORA` por hora entre todas las direcciones (un ataque con muchas IPs);
 *   · cada guardado de un intento, hasta `GUARDADOS_POR_MINUTO` por minuto (el avance se guarda en cada pregunta);
 *   · y el formulario lleva un campo trampa que una persona no ve (lo mira la ruta).
 * En memoria a propósito, como `lib/external/write-rate-limit.ts`: perder el contador en un reinicio no abre nada
 * (no protege una contraseña) y no suma una tabla.
 */
export const POR_IP_POR_HORA = 10;
export const TOTAL_POR_HORA = 400;
export const GUARDADOS_POR_MINUTO = 40;

const HORA = 3_600_000;
const MINUTO = 60_000;

const porIp = new Map<string, number[]>();
let total: number[] = [];
const porIntento = new Map<string, number[]>();

function dentro(lista: number[], ventana: number, ahora: number): number[] {
  return lista.filter((t) => t > ahora - ventana);
}

/** ¿Puede empezar un intento nuevo esta dirección? Si puede, lo cuenta. */
export function permitirEmpezar(ipHash: string | null, ahora: number = Date.now()): boolean {
  total = dentro(total, HORA, ahora);
  if (ipHash === null) {
    if (total.length >= TOTAL_POR_HORA) return false;
    total.push(ahora);
    return true;
  }
  const deEsta = dentro(porIp.get(ipHash) ?? [], HORA, ahora);
  if (deEsta.length >= POR_IP_POR_HORA || total.length >= TOTAL_POR_HORA) {
    porIp.set(ipHash, deEsta);
    return false;
  }
  deEsta.push(ahora);
  total.push(ahora);
  porIp.set(ipHash, deEsta);
  if (porIp.size > 5000) for (const [k, v] of porIp) if (!v.some((t) => t > ahora - HORA)) porIp.delete(k);
  return true;
}

/** ¿Puede guardar este intento ahora? Si puede, lo cuenta. */
export function permitirGuardar(token: string, ahora: number = Date.now()): boolean {
  const recientes = dentro(porIntento.get(token) ?? [], MINUTO, ahora);
  if (recientes.length >= GUARDADOS_POR_MINUTO) {
    porIntento.set(token, recientes);
    return false;
  }
  recientes.push(ahora);
  porIntento.set(token, recientes);
  if (porIntento.size > 5000) for (const [k, v] of porIntento) if (!v.some((t) => t > ahora - MINUTO)) porIntento.delete(k);
  return true;
}

// ── Las visitas (O6 etapa 3) ──────────────────────────────────────────────────
// Contar una visita no crea nada de nadie, pero un script que recarga la página inflaría la medición del corte. La
// página ya cuenta una vez por pestaña; acá, una dirección suma hasta `VISITAS_POR_DIRECCION` por test cada
// `VENTANA_DE_VISITAS_MIN` minutos, y entre todas hasta `VISITAS_POR_HORA`. *Por qué no una sola por dirección:* una
// oficina, o los teléfonos de un mismo operador, salen a internet con la misma dirección; con una sola, cinco personas
// distintas contaban como una y «terminan de los que abren» pasaba de 100 % (revisión del 26 oct).

export const VISITAS_POR_DIRECCION = 10;
export const VENTANA_DE_VISITAS_MIN = 30;
export const VISITAS_POR_HORA = 3000;

const visitasDe = new Map<string, number[]>();
let visitas: number[] = [];

/** ¿Cuenta esta visita? Si cuenta, la anota. Sin dirección, solo cuenta para el tope total. */
export function permitirVisita(ipHash: string | null, test: string, ahora: number = Date.now()): boolean {
  visitas = dentro(visitas, HORA, ahora);
  if (visitas.length >= VISITAS_POR_HORA) return false;
  if (ipHash !== null) {
    const clave = `${ipHash}:${test}`;
    const recientes = dentro(visitasDe.get(clave) ?? [], VENTANA_DE_VISITAS_MIN * MINUTO, ahora);
    if (recientes.length >= VISITAS_POR_DIRECCION) {
      visitasDe.set(clave, recientes);
      return false;
    }
    recientes.push(ahora);
    visitasDe.set(clave, recientes);
    if (visitasDe.size > 20000) for (const [k, v] of visitasDe) if (!v.some((t) => t > ahora - VENTANA_DE_VISITAS_MIN * MINUTO)) visitasDe.delete(k);
  }
  visitas.push(ahora);
  return true;
}

// ── El PDF del resultado (28 oct) ─────────────────────────────────────────────
// Cada PDF levanta un Chromium en el servidor (lib/print/pdf-runner.ts, que ya limita a 2 a la vez con cola de 4 para
// TODO Nexus). Como la página es pública, además: una dirección pide hasta `PDF_POR_DIRECCION` cada `VENTANA_DE_PDF_MIN`
// minutos (cuentan también los pedidos con un token inventado), y entre todas se arman hasta `PDF_POR_HORA`. El tope
// total cuenta solo los PDF de un resultado que existe: con tokens inventados un script no puede dejar sin PDF a los
// prospectos de verdad (revisión del 28 oct).

export const PDF_POR_DIRECCION = 6;
export const VENTANA_DE_PDF_MIN = 10;
export const PDF_POR_HORA = 120;

const pdfDe = new Map<string, number[]>();
let pdfs: number[] = [];

/** ¿Puede esta dirección pedir un PDF ahora? Si puede, lo cuenta. Sin dirección, pasa (la cuida el tope total). */
export function permitirPdfDeLaDireccion(ipHash: string | null, ahora: number = Date.now()): boolean {
  if (ipHash === null) return true;
  const recientes = dentro(pdfDe.get(ipHash) ?? [], VENTANA_DE_PDF_MIN * MINUTO, ahora);
  if (recientes.length >= PDF_POR_DIRECCION) {
    pdfDe.set(ipHash, recientes);
    return false;
  }
  recientes.push(ahora);
  pdfDe.set(ipHash, recientes);
  if (pdfDe.size > 5000) for (const [k, v] of pdfDe) if (!v.some((t) => t > ahora - VENTANA_DE_PDF_MIN * MINUTO)) pdfDe.delete(k);
  return true;
}

/** ¿Se puede armar un PDF más esta hora, entre todos? Si se puede, lo cuenta. Va DESPUÉS de saber que el resultado existe. */
export function permitirPdfEnTotal(ahora: number = Date.now()): boolean {
  pdfs = dentro(pdfs, HORA, ahora);
  if (pdfs.length >= PDF_POR_HORA) return false;
  pdfs.push(ahora);
  return true;
}

/**
 * La dirección del visitante para contarlo. La toma de lo que agrega el proxy de entrada (nginx): la ÚLTIMA de
 * `X-Forwarded-For` (las anteriores las puede escribir el propio visitante, y con la primera un script cambiaba de
 * dirección en cada pedido y nunca chocaba con el tope; revisión del 26 oct), y si no viene, `X-Real-IP`. Sin ninguna,
 * null: ese pedido solo cuenta para el tope total.
 */
export function direccionDelVisitante(headers: { get(name: string): string | null }): string | null {
  const ultima = headers.get("x-forwarded-for")?.split(",").map((x) => x.trim()).filter(Boolean).pop();
  const ip = ultima || headers.get("x-real-ip")?.trim() || "";
  return ip && ip.length <= 64 ? ip : null;
}

/** Para las pruebas. */
export function reiniciarLimites(): void {
  porIp.clear();
  total = [];
  porIntento.clear();
  visitasDe.clear();
  visitas = [];
  pdfDe.clear();
  pdfs = [];
}
