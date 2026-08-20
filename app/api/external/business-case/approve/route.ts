/**
 * POST /api/external/business-case/approve   body: { token, email, name? }
 *
 * Endpoint PÚBLICO (sin sesión) con el que el prospecto aprueba la propuesta dejando solo
 * su correo. Es la contracara del "sin contraseña": si el link ya no exige credenciales,
 * la aprobación tampoco puede exigir una cuenta.
 *
 * El token se resuelve por el MISMO chokepoint que la página (`resolveBusinessCaseAccess`)
 * — un segundo lugar que tradujera token → caso sería un segundo lugar donde acordarse de
 * revocado, publicado y caducado. Por eso el chokepoint devuelve `businessCaseId`.
 *
 * No hay rate-limit propio y no hace falta: `approveBusinessCase` es idempotente (la
 * primera aprobación gana y no se pisa), así que martillar esto no cambia ningún dato.
 * Lo que protege el endpoint es el token, igual que a la propia propuesta.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveBusinessCaseAccess } from "@/lib/external/business-case-view";
// Import directo a `mutations` y no al índice del módulo: `lib/business-cases/index.ts`
// re-exporta el agente (SDK de Anthropic) y esta es una ruta pública que no lo necesita.
import { approveBusinessCase } from "@/lib/business-cases/mutations";

/* Misma laxitud que el form del cliente (components/external/PropuestaAprobacion.tsx):
   acá no se autentica a nadie, se registra un contacto. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_LARGO = 160;

export async function POST(req: NextRequest) {
  let body: { token?: unknown; email?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const email = (typeof body.email === "string" ? body.email : "").trim();
  const name = (typeof body.name === "string" ? body.name : "").trim().slice(0, MAX_LARGO);

  if (!EMAIL_RE.test(email) || email.length > MAX_LARGO) {
    return NextResponse.json({ ok: false, error: "Correo inválido" }, { status: 400 });
  }

  const state = await resolveBusinessCaseAccess(token);
  // Caducada o denegada: el mismo 404 neutro. Una propuesta vencida no se aprueba —
  // y una ya aprobada no vence (ver el chokepoint), así que este caso es solo el de
  // alguien intentando aprobar algo que nadie aprobó a tiempo.
  if (state.kind !== "ok") {
    return NextResponse.json({ ok: false, error: "No disponible" }, { status: 404 });
  }

  const { approval, yaEstaba } = await approveBusinessCase(state.businessCaseId, { email, name });

  const payload = {
    ok: !yaEstaba,
    approval: {
      approvedAt: approval.approvedAt.toISOString(),
      approvedByEmail: approval.approvedByEmail,
      approvedByName: approval.approvedByName,
    },
  };
  // 409 y no 200 cuando ya estaba: el cliente ve la aprobación existente (no un error),
  // pero el estado dice la verdad — este request no aprobó nada.
  return NextResponse.json(payload, { status: yaEstaba ? 409 : 200 });
}
