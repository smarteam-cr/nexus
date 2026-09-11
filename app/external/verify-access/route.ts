/**
 * POST /external/verify-access
 *
 * Endpoint público (sin sesión Supabase) que verifica credenciales del cliente externo: token (de
 * la URL de acceso) + contraseña (del form). Si ambas son válidas y el acceso no está revocado,
 * SUMA la credencial a la lista de proyectos abiertos del navegador (cookie httpOnly
 * `nexus_ext_accesos`) y devuelve el id del acceso, para que el formulario lleve a la dirección de
 * ESE proyecto. Si no, 401 con mensaje genérico (no revela si el token existe).
 *
 * ── POR QUÉ VIVE BAJO /external Y NO BAJO /api/external (2026-09-10) ─────────
 * Para sumarle una entrada a la lista hay que LEERLA, y la cookie tiene `path: "/external"`: el
 * navegador no la manda a /api/external/*. Antes no hacía falta leerla —había una sola credencial y
 * se pisaba—, y ese «se pisaba» era el bug: el segundo proyecto que se abría borraba el primero, y
 * la dirección sin proyecto mostraba el último. Ver lib/external/lista-de-accesos.ts. La dirección
 * vieja redirige acá (next.config.ts) para las pestañas abiertas desde antes del deploy.
 *
 * La credencial NO otorga acceso por sí sola: cada render re-resuelve el token y re-chequea
 * revocado, versión de la contraseña, publicable, que sea el proyecto que nombra la dirección y el
 * flag de la superficie (lib/external/access.ts + cada vista).
 *
 * Rate limiting PERSISTIDO por token (lib/external/verify-rate-limit.ts, tabla
 * ExternalVerifyAttempt): 5 fallos en 5 min → bloqueo de 10 min (429). Y por IP (A-10): 20 fallos
 * en 15 min → 15 min, para quien rota tokens con la misma contraseña. Sin cabecera del proxy no se
 * cuenta por IP (ver claveDeIp). Es protección mínima contra brute-force online. Para defensa real,
 * la entropía de la password (12 chars del alphabet sin ambiguos → ~71 bits) y el costo de
 * bcrypt(12) son lo que cuenta. Antes era un Map en memoria: cada deploy le reseteaba el contador
 * al atacante.
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db/prisma";
import { publicableAfuera, resolverAccesosDelNavegador } from "@/lib/external/access";
import { armarCredencial } from "@/lib/external/credencial";
import {
  COOKIE_DE_ACCESOS,
  leerListaDeAccesos,
  podarListaDeAccesos,
  sumarALaListaDeAccesos,
} from "@/lib/external/lista-de-accesos";
import { nombreVisibleDelProyecto } from "@/lib/external/nombre-visible";
import { bloqueoVigente, claveDeIp, clearAttempts, registrarFallo } from "@/lib/external/verify-rate-limit";

// ── Handler ──────────────────────────────────────────────────────────────────

const GENERIC_INVALID = { ok: false, reason: "invalid" } as const;

export async function POST(req: NextRequest) {
  /* Solo el formulario de Nexus canjea una contraseña. Un formulario de OTRO sitio no puede mandar
     application/json, y el navegador marca el origen en Sec-Fetch-Site. Sin esto, cualquier página
     podía hacer que el navegador del cliente postee acá: gastarle intentos al token y a la IP de su
     oficina, o —con una credencial propia— pisarle la lista de proyectos abiertos. */
  const tipo = (req.headers.get("content-type") ?? "").toLowerCase();
  const sitio = req.headers.get("sec-fetch-site");
  if (!tipo.startsWith("application/json") || (sitio !== null && sitio !== "same-origin")) {
    return NextResponse.json(GENERIC_INVALID, { status: 403 });
  }

  let body: { token?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  // Validación de forma: token es hex 64 chars exactos. Si no, 401 sin tocar DB.
  // Esto evita consultas a DB con basura y no revela info adicional.
  if (!/^[a-f0-9]{64}$/i.test(token) || password.length === 0) {
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }

  const now = Date.now();
  const ip = claveDeIp(req.headers);
  const remaining = await bloqueoVigente(token, ip, now);
  if (remaining > 0) {
    return NextResponse.json(
      { ok: false, reason: "rate_limited", retryAfterSeconds: remaining },
      { status: 429, headers: { "Retry-After": String(remaining) } },
    );
  }

  const access = await prisma.projectExternalAccess.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      passwordHash: true,
      revokedAt: true,
      project: {
        select: {
          id: true,
          name: true,
          // De qué CLASE es el proyecto. Este endpoint NO pasa por `resolveActiveAccess`
          // —hace su propia consulta para canjear la contraseña por la credencial de 30 días—,
          // así que el check de "¿admite mirones de afuera?" tiene que estar acá también.
          hubspotPipelineId: true,
          proyectoInterno: true,
          hermanoCsProjectId: true,
          altaEstado: true,
          // Para la tarjeta «Entrando a <proyecto> · <cliente>»: quien acaba de poner la
          // contraseña ve de QUÉ proyecto era antes de llegar.
          client: { select: { name: true } },
        },
      },
    },
  });

  // Caso 1: token no existe. Aún así corremos un bcrypt "fake" para evitar
  // timing leak (si no lo hacemos, un token inexistente responde antes que
  // uno existente con password mala, lo cual filtra qué tokens son válidos).
  if (!access) {
    await bcrypt.compare(password, "$2b$12$ZxYzZxYzZxYzZxYzZxYzZ.PadPadPadPadPadPadPadPadPadPadPadPa");
    await registrarFallo(token, ip, now);
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }

  // Caso 2: acceso revocado. Mismo mensaje genérico — no revelamos el estado.
  if (access.revokedAt) {
    await bcrypt.compare(password, access.passwordHash);
    await registrarFallo(token, ip, now);
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }

  /* Caso 2b: el proyecto dejó de admitir publicación externa (alta sin terminar).
     Se trata IGUAL que un acceso revocado —mismo bcrypt para no filtrar por tiempo, mismo
     mensaje genérico—: para quien está afuera no hay diferencia entre "te revocaron" y
     "este proyecto ya no se comparte", y contarle cuál de las dos es le dice algo del
     estado interno que no le corresponde. */
  if (!publicableAfuera(access.project)) {
    await bcrypt.compare(password, access.passwordHash);
    await registrarFallo(token, ip, now);
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }

  // Caso 3: comparar contraseña real.
  const passwordOk = await bcrypt.compare(password, access.passwordHash);
  if (!passwordOk) {
    await registrarFallo(token, ip, now);
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }

  // Éxito: limpiar el rate-limit del token + actualizar lastUsedAt en DB.
  await clearAttempts(token);
  await prisma.projectExternalAccess.update({
    where: { id: access.id },
    data: { lastUsedAt: new Date() },
  });

  const previa = req.cookies.get(COOKIE_DE_ACCESOS)?.value;
  /* Antes de sumar se sacan las entradas que ya no abren nada (revocadas, con la contraseña
     cambiada, un token que se regeneró) y las viejas de ESTE mismo acceso. Sin esto una entrada
     muerta ocupa lugar en el tope durante 30 días y saca de la lista a un proyecto vivo. */
  const vivas = new Set(
    (await resolverAccesosDelNavegador(leerListaDeAccesos(previa, now)))
      .filter((a) => a.accessId !== access.id)
      .map((a) => a.credencial),
  );

  const res = NextResponse.json({
    ok: true,
    // El formulario arma la dirección de destino con este id (lib/external/rutas.ts). El token
    // no vuelve a aparecer en ninguna URL, y la dirección dice de qué proyecto es.
    acceso: access.id,
    proyecto: nombreVisibleDelProyecto(access.project.name, access.project.client.name),
    cliente: access.project.client.name,
  });

  // La credencial (`<token>.<versión>`, A-11: cambiar la contraseña la invalida) se SUMA a la
  // lista del navegador en vez de pisar la anterior: así un navegador tiene varios proyectos
  // abiertos a la vez. NO otorga acceso por sí sola (ver el docblock). Persistente ~30 días por
  // entrada. `secure` solo en prod (en localhost http no se setearía).
  res.cookies.set({
    name: COOKIE_DE_ACCESOS,
    value: sumarALaListaDeAccesos(
      podarListaDeAccesos(previa, (c) => vivas.has(c), now),
      armarCredencial(token, access.passwordHash),
      now,
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/external",
    maxAge: 60 * 60 * 24 * 30, // 30 días (cada entrada vence a los 30 días de SU emisión)
  });

  return res;
}
