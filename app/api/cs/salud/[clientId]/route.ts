/**
 * POST /api/cs/salud/[clientId]   body: { accion: "corregir", salud, nota } | { accion: "quitar-correccion" }
 *                                       | { accion: "en-espera", nota } | { accion: "quitar-espera" }
 *                                       | { accion: "descartar-espera", huella }
 *
 * La CSL (o un super admin) corrige el color que calcula Nexus o marca la cuenta «en espera del cliente»
 * (2026-10-09, docs/exito-del-cliente-cartera-plan.md, entrega 2; regla en lib/cs/ajustes-de-salud.ts). El CSE
 * ve la corrección, no la hace (decisión de Elías del 2026-10-07).
 *
 * Al corregir se guarda lo que decía Nexus (el color y sus razones rojas): una razón roja que no estaba deja sin
 * efecto la corrección. Devuelve cómo quedó la cuenta y su color de nuevo; la pantalla refresca.
 *
 * ⚠ La cuenta tiene que pasar el where de acceso del usuario: 404 y no 403 (como al cerrar una alerta).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardLiderDeCs } from "@/lib/auth/api-guards";
import { accessibleClientWhere } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { ajusteDeSaludSchema } from "@/lib/cs/schema";
import { cargarCuentas, hoyEnCostaRica } from "@/lib/cs/cartera";
import { saludDeLaCuenta, saludSegunNexus } from "@/lib/cs/cartera-reglas";
import { registrarAjuste } from "@/lib/cs/ajustes-de-salud-server";
import { faltaLaTabla } from "@/lib/cs/clasificacion-server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const guard = await guardLiderDeCs();
  if (guard instanceof NextResponse) return guard;

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ajusteDeSaludSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const pedido = parsed.data;

  const clientWhere = await accessibleClientWhere(guard.user);
  const cliente = await prisma.client.findFirst({
    where: { id: clientId, ...(clientWhere ? { AND: [clientWhere] } : {}) },
    select: { id: true },
  });
  if (!cliente) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

  const quien = { email: guard.user.email ?? "sin-correo", nombre: guard.teamMember?.name ?? null };
  const hoy = hoyEnCostaRica();
  try {
    let saludDeNexus: string | null = null;
    let razonesDeNexus: string[] = [];
    if (pedido.accion === "corregir") {
      // Lo que dice Nexus HOY, sin ninguna corrección: es contra lo que se mide si algo nuevo la deja sin efecto.
      const [cuenta] = await cargarCuentas(clientWhere, { clientIds: [clientId], incluirSinServicio: true });
      if (cuenta) {
        const nexus = saludSegunNexus(cuenta, hoy);
        saludDeNexus = nexus.salud;
        razonesDeNexus = nexus.razones.filter((r) => r.roja).map((r) => r.clave);
      }
    }
    const ajustes = await registrarAjuste(
      clientId,
      {
        tipo: pedido.accion,
        salud: pedido.accion === "corregir" ? pedido.salud : null,
        nota: "nota" in pedido ? pedido.nota : null,
        saludDeNexus,
        razonesDeNexus,
        huella: pedido.accion === "descartar-espera" ? pedido.huella : null,
      },
      quien,
    );
    const [despues] = await cargarCuentas(clientWhere, { clientIds: [clientId], incluirSinServicio: true }).catch(() => []);
    return NextResponse.json({ ajustes, salud: despues ? saludDeLaCuenta(despues, hoy) : null });
  } catch (e) {
    if (faltaLaTabla(e)) {
      return NextResponse.json(
        { error: "Falta aplicar el SQL de la cartera (scripts/sql/2026-10-09-cartera-de-la-csl.sql)." },
        { status: 503 },
      );
    }
    throw e;
  }
}
