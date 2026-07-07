/**
 * lib/external/verify-rate-limit.ts
 *
 * Rate-limit PERSISTIDO (tabla ExternalVerifyAttempt) para los verify-access
 * externos — proyecto y business case comparten esta lógica. Misma semántica
 * que el Map en memoria que reemplaza (5 fallos en 5 min → bloqueo 10 min),
 * pero sobrevive deploys/restarts: antes, cada redeploy le reseteaba el
 * contador a un atacante.
 *
 * Las carreras entre requests concurrentes pueden sub-contar un fallo — se
 * acepta (la defensa real es la contraseña de ~71 bits + bcrypt(12); esto solo
 * frena el martilleo). El job maintenance-daily barre filas viejas.
 */
import { prisma } from "@/lib/db/prisma";

const MAX_FAILURES = 5;
const WINDOW_MS = 5 * 60 * 1000; // ventana de 5 minutos para contar fallos
const BLOCK_MS = 10 * 60 * 1000; // 10 minutos de bloqueo tras alcanzar el límite

/** Segundos restantes de bloqueo (>0) o 0 si no está bloqueado. */
export async function getRemainingBlockSeconds(token: string, now: number): Promise<number> {
  const rec = await prisma.externalVerifyAttempt.findUnique({ where: { token } });
  if (!rec?.blockedUntil || rec.blockedUntil.getTime() <= now) return 0;
  return Math.ceil((rec.blockedUntil.getTime() - now) / 1000);
}

/** Registra un fallo; si supera el umbral en la ventana, activa el bloqueo. */
export async function registerFailure(token: string, now: number): Promise<void> {
  const rec = await prisma.externalVerifyAttempt.findUnique({ where: { token } });

  if (!rec || now - rec.windowStartAt.getTime() > WINDOW_MS) {
    // Sin registro o ventana expirada → ventana nueva con este fallo.
    await prisma.externalVerifyAttempt.upsert({
      where: { token },
      create: { token, count: 1, windowStartAt: new Date(now), blockedUntil: null },
      update: { count: 1, windowStartAt: new Date(now), blockedUntil: null },
    });
    return;
  }

  const nextCount = rec.count + 1;
  if (nextCount >= MAX_FAILURES) {
    // Bloquear; al expirar el bloqueo arranca una ventana nueva.
    await prisma.externalVerifyAttempt.update({
      where: { token },
      data: { count: 0, windowStartAt: new Date(now + BLOCK_MS), blockedUntil: new Date(now + BLOCK_MS) },
    });
  } else {
    await prisma.externalVerifyAttempt.update({ where: { token }, data: { count: { increment: 1 } } });
  }
}

/** Borra el rate-limit del token (tras un login exitoso). */
export async function clearAttempts(token: string): Promise<void> {
  await prisma.externalVerifyAttempt.deleteMany({ where: { token } });
}
