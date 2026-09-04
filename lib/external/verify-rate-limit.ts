/**
 * lib/external/verify-rate-limit.ts
 *
 * Rate-limit PERSISTIDO (tabla ExternalVerifyAttempt) para los verify-access externos —
 * proyecto y business case comparten esta lógica. Sobrevive deploys/restarts: antes, cada
 * redeploy le reseteaba el contador a un atacante.
 *
 * ── DOS CLAVES POR REQUEST (A-10, auditoría 2026-09-03) ─────────────────────────────────────
 *   · el TOKEN atacado (5 fallos en 5 min → 10 min de bloqueo): frena el martilleo sobre UN enlace;
 *   · la IP que ataca (`ip:<addr>`, 20 fallos en 15 min → 15 min): frena a quien rota tokens.
 *     Contar solo por token dejaba gratis probar UNA contraseña contra miles de tokens.
 * La tabla es la misma: `token` es un String libre y la clave sintética lleva el prefijo `ip:`,
 * así que nunca colisiona con un token real (64 hex). Sin cabecera de proxy NO hay clave de IP:
 * es preferible no contar a meter a todos los clientes en el mismo balde.
 *
 * Las carreras entre requests concurrentes pueden sub-contar un fallo — se acepta (la defensa
 * real es la contraseña de ≥12 + bcrypt(12); esto solo frena el martilleo). El job
 * maintenance-daily barre las filas viejas, de las dos clases por igual.
 */
import { prisma } from "@/lib/db/prisma";

export interface PoliticaDeIntentos {
  maxFallos: number;
  ventanaMs: number;
  bloqueoMs: number;
}

export const POLITICA_POR_TOKEN: PoliticaDeIntentos = {
  maxFallos: 5,
  ventanaMs: 5 * 60 * 1000,
  bloqueoMs: 10 * 60 * 1000,
};

/** Más laxa que la del token a propósito: una oficina entera comparte IP detrás de su NAT. */
export const POLITICA_POR_IP: PoliticaDeIntentos = {
  maxFallos: 20,
  ventanaMs: 15 * 60 * 1000,
  bloqueoMs: 15 * 60 * 1000,
};

export const PREFIJO_CLAVE_IP = "ip:";

/**
 * La IP del cliente según el proxy (`X-Forwarded-For` primero, después `X-Real-IP` y
 * `CF-Connecting-IP`), como clave de la tabla; `null` si ninguna cabecera la trae — entonces
 * ese request no se cuenta por IP.
 */
export function claveDeIp(headers: { get(name: string): string | null }): string | null {
  const primeraDelForwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip =
    primeraDelForwarded ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    "";
  if (!ip || ip.length > 64) return null;
  return `${PREFIJO_CLAVE_IP}${ip}`;
}

/** Segundos restantes de bloqueo (>0) o 0 si esa clave no está bloqueada. */
export async function getRemainingBlockSeconds(clave: string, now: number): Promise<number> {
  const rec = await prisma.externalVerifyAttempt.findUnique({ where: { token: clave } });
  if (!rec?.blockedUntil || rec.blockedUntil.getTime() <= now) return 0;
  return Math.ceil((rec.blockedUntil.getTime() - now) / 1000);
}

/** Segundos de bloqueo vigentes para el token O la IP: el mayor de los dos. */
export async function bloqueoVigente(token: string, ip: string | null, now: number): Promise<number> {
  const [porToken, porIp] = await Promise.all([
    getRemainingBlockSeconds(token, now),
    ip ? getRemainingBlockSeconds(ip, now) : Promise.resolve(0),
  ]);
  return Math.max(porToken, porIp);
}

/** Registra un fallo contra una clave; si supera el umbral de su política en la ventana, la bloquea. */
export async function registerFailure(
  clave: string,
  now: number,
  politica: PoliticaDeIntentos = POLITICA_POR_TOKEN,
): Promise<void> {
  const rec = await prisma.externalVerifyAttempt.findUnique({ where: { token: clave } });

  if (!rec || now - rec.windowStartAt.getTime() > politica.ventanaMs) {
    // Sin registro o ventana expirada → ventana nueva con este fallo.
    await prisma.externalVerifyAttempt.upsert({
      where: { token: clave },
      create: { token: clave, count: 1, windowStartAt: new Date(now), blockedUntil: null },
      update: { count: 1, windowStartAt: new Date(now), blockedUntil: null },
    });
    return;
  }

  const nextCount = rec.count + 1;
  if (nextCount >= politica.maxFallos) {
    // Bloquear; al expirar el bloqueo arranca una ventana nueva.
    await prisma.externalVerifyAttempt.update({
      where: { token: clave },
      data: {
        count: 0,
        windowStartAt: new Date(now + politica.bloqueoMs),
        blockedUntil: new Date(now + politica.bloqueoMs),
      },
    });
  } else {
    await prisma.externalVerifyAttempt.update({ where: { token: clave }, data: { count: { increment: 1 } } });
  }
}

/** Un fallo cuenta contra el token Y contra la IP (si el proxy la trae). */
export async function registrarFallo(token: string, ip: string | null, now: number): Promise<void> {
  await registerFailure(token, now, POLITICA_POR_TOKEN);
  if (ip) await registerFailure(ip, now, POLITICA_POR_IP);
}

/**
 * Borra el rate-limit del TOKEN tras un login exitoso. La clave de IP se deja a propósito:
 * acertar un enlace no le devuelve a esa IP el crédito para seguir probando otros.
 */
export async function clearAttempts(token: string): Promise<void> {
  await prisma.externalVerifyAttempt.deleteMany({ where: { token } });
}
