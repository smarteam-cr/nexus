"use server";

/**
 * app/external/diagnostico/actions.ts — el CLIENTE aprueba el diagnóstico desde su enlace (2026-10-04).
 *
 * Hasta acá la aprobación la registraba el equipo con el correo del cliente pegado como evidencia
 * (components/canvas/EstadoDelDocumento.tsx). Ahora el cliente también puede aprobar con un botón:
 * deja su nombre y su correo, marca que lo aprueba, y queda el mismo registro —el hito «aprobado»
 * sobre la foto presentada, la nota en la empresa en HubSpot— por la MISMA puerta
 * (`registrarAprobacion`), con lo que marcó como evidencia.
 *
 * POR QUÉ UNA SERVER ACTION: las credenciales del navegador viven en cookies con `path: "/external"`
 * y no viajan a `/api/external/*` (ver app/external/kickoff/actions.ts, el mismo molde). Atada al
 * proyecto de la página con `.bind(null, acceso, versionVista)`: aprueba el diagnóstico de ESE
 * proyecto, y la versión que el cliente tiene en pantalla (2026-10-05), o nada.
 *
 * Los mismos checks que la lectura (lib/external/diagnostico-view.ts): el acceso de esta página y el
 * diagnóstico publicado. `registrarAprobacion` exige además que esté presentado y sin cambios desde
 * entonces: el cliente aprueba lo que está viendo, nunca un borrador.
 */
import { touchAccess } from "@/lib/external/access";
import { accesosDelNavegador } from "@/lib/external/accesos-del-navegador";
import { elegirAcceso } from "@/lib/external/selector-de-proyectos";
import { esIdDeAcceso } from "@/lib/external/rutas";
import { checkExternalWriteRate } from "@/lib/external/write-rate-limit";
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { evidenciaDelEnlace } from "@/lib/canvas/estado-del-documento";
import { registrarAprobacion } from "@/lib/canvas/estado-del-documento-servidor";

/** `nombre`/`fecha` son los de la aprobación REAL: si otra persona se adelantó, los suyos (o `null` si no se saben). */
export type AprobarDiagnosticoResult = { ok: true; nombre: string | null; fecha: string | null } | { ok: false; error: string };

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX = 160;
const SIN_ACCESO = "Tu acceso ya no está disponible. Recarga la página.";

/** Hoy en Costa Rica, AAAA-MM-DD (la fecha de la aprobación es la del cliente, no la del servidor). */
function hoyEnCostaRica(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
}

export async function aprobarDiagnosticoAction(
  acceso: string,
  versionVista: number,
  nombre: string,
  email: string,
  acepto: boolean,
): Promise<AprobarDiagnosticoResult> {
  if (
    !esIdDeAcceso(acceso) ||
    !Number.isInteger(versionVista) ||
    versionVista < 1 ||
    typeof nombre !== "string" ||
    typeof email !== "string"
  ) {
    return { ok: false, error: "Solicitud inválida." };
  }
  const quien = nombre.trim().slice(0, MAX);
  const correo = email.trim().slice(0, MAX);
  if (quien.length < 2) return { ok: false, error: "Escribe tu nombre." };
  if (!CORREO.test(correo)) return { ok: false, error: "Revisa tu correo: no parece válido." };
  if (acepto !== true) return { ok: false, error: "Marca la casilla para confirmar que lo apruebas." };

  // El proyecto que nombra la página, y solo si este navegador lo tiene abierto con su contraseña.
  const actual = elegirAcceso(await accesosDelNavegador(), acceso);
  if (!actual) return { ok: false, error: SIN_ACCESO };
  // Si el equipo dejó de compartir el diagnóstico, la credencial viva no habilita nada.
  if (!actual.project.diagnosticoPublishedAt) return { ok: false, error: SIN_ACCESO };

  if (!checkExternalWriteRate(actual.credencial)) {
    return { ok: false, error: "Demasiados intentos seguidos. Espera unos segundos." };
  }

  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId: actual.project.id, ...canvasOf("diagnosis") },
    select: { id: true },
  });
  if (!canvas) return { ok: false, error: SIN_ACCESO };

  const fecha = hoyEnCostaRica();
  const r = await registrarAprobacion(
    canvas.id,
    { nombre: quien, email: correo, fecha, evidencia: evidenciaDelEnlace(quien, correo), evidenciaDocumentoId: null },
    null,
    versionVista,
  );
  if (!r.ok) {
    // Ya estaba aprobada ESTA versión (otra persona se adelantó, o doble clic): no es un error para el
    // cliente, pero la pantalla dice quién la aprobó de verdad y cuándo, nunca quien llegó tarde.
    if (r.codigo === "ya-aprobado") return { ok: true, nombre: r.aprobado?.nombre ?? null, fecha: r.aprobado?.fecha ?? null };
    // El equipo presentó otra versión mientras el cliente miraba esta: que vea la nueva antes de aprobar.
    if (r.codigo === "otra-version") {
      return { ok: false, error: "Hay una versión más nueva de este diagnóstico. Recarga la página para verla antes de aprobarla." };
    }
    // El equipo regeneró, editó o reabrió después de presentarlo: lo que ve ya no es lo vigente.
    if (r.status === 409) {
      return { ok: false, error: "El equipo está ajustando este diagnóstico. Cuando esté la versión nueva, vas a poder aprobarla aquí." };
    }
    return { ok: false, error: "No se pudo registrar la aprobación. Vuelve a intentarlo en un momento." };
  }

  await touchAccess(actual.accessId);
  return { ok: true, nombre: quien, fecha };
}
