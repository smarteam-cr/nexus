/**
 * POST /api/external/test — EMPEZAR el test del diagnóstico de rendimiento (área O, 2026-10-26).
 *
 * Pública (sin login): la persona llena el formulario de la portada (nombre y apellido, correo de trabajo, dominio,
 * teléfono, puesto, industria y área) y recibe su intento: un token de 256 bits y las preguntas, sin ids del banco ni
 * niveles. El banco lo decide la industria (el de su edición o el de la general).
 * Protección contra abuso (lib/tests-diagnostico/limite.ts): tope por dirección y en total, y un campo trampa.
 * Sin preguntas aprobadas para esa área, 409: el test no se abre con preguntas que nadie revisó.
 */
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { EmpezarTestSchema } from "@/lib/tests-diagnostico/schema";
import { direccionDelVisitante, permitirEmpezar } from "@/lib/tests-diagnostico/limite";
import { AREA_POR_SLUG } from "@/lib/tests-diagnostico/tipos";
import { ErrorDelTest, empezarTest } from "@/lib/tests-diagnostico/servicio-server";
import { ErrorSinTablas } from "@/lib/tests-diagnostico/repositorio-server";

/** El hash de la dirección: nunca se guarda ni se cuenta la IP misma. */
function hashDeLaDireccion(req: NextRequest): string | null {
  const ip = direccionDelVisitante(req.headers);
  return ip ? createHash("sha256").update(`test-diagnostico:${ip}`).digest("hex").slice(0, 32) : null;
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = EmpezarTestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Revisa los datos del formulario." }, { status: 400 });
  }
  const d = parsed.data;
  // El campo trampa lleno: un script. Se responde como si nada para no enseñarle la regla.
  if (d.sitio) return NextResponse.json({ error: "No se pudo empezar el test. Vuelve a intentarlo." }, { status: 400 });
  if (!permitirEmpezar(hashDeLaDireccion(req))) {
    return NextResponse.json({ error: "Demasiados intentos seguidos. Espera un rato y vuelve a intentarlo." }, { status: 429 });
  }
  try {
    const vista = await empezarTest({
      area: AREA_POR_SLUG[d.area],
      version: d.version,
      persona: {
        // El intento guarda una sola persona con su nombre entero: el apellido va detrás.
        nombre: [d.nombre, d.apellido].filter(Boolean).join(" ").slice(0, 160),
        email: d.email,
        telefono: d.telefono,
        puesto: d.puesto,
        empresa: d.empresa,
        dominio: d.dominio,
        industria: d.industria,
      },
      origen: d.origen ?? null,
    });
    return NextResponse.json(vista);
  } catch (e) {
    if (e instanceof ErrorDelTest) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ErrorSinTablas) return NextResponse.json({ error: "Este test todavía no está abierto." }, { status: 503 });
    throw e;
  }
}
