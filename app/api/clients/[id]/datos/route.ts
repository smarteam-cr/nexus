/**
 * /api/clients/[id]/datos — los datos de la empresa (R1, 2026-10-24).
 *
 * GET  → cada dato con su valor, su fuente, su fecha y quién lo decidió; las propuestas pendientes; el contador; el TAM
 *        estimado v1 con cómo se calculó, lo que ya paga y lo que le falta (U27); los casos que le faltan comprar (R12);
 *        la última investigación y su corrida.
 * POST → { clave, valor, cita? } una persona edita un dato. Con `clientes.decidirDatos` se aplica; sin ella queda como
 *        propuesta para quien decide. Todo pasa por lib/clients/datos-de-la-empresa-server.ts.
 *
 * Interno (el TAM lo ve solo el equipo): acceso a la empresa por `guardAccessToClient`. Lo que queda aplicado se
 * escribe en la empresa de HubSpot (R2, lib/clients/escritura-en-hubspot-server.ts) si `EMPRESA_HUBSPOT_ESCRITURA=1`;
 * la respuesta dice cómo le fue (`hubspot`).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { ErrorDeDato, leerDatosDeLaEmpresa, proponerDato } from "@/lib/clients/datos-de-la-empresa-server";
import { EdicionDeDatoSchema } from "@/lib/clients/schema";
import { loQueLeFalta, loQueYaPaga } from "@/lib/clients/lo-que-ya-paga";
import { calcularTamV1 } from "@/lib/clients/tam-v1";
import { corridaDeLaInvestigacion, ultimaInvestigacion } from "@/lib/clients/investigacion/servidor";
import { escribirEnHubspot } from "@/lib/clients/escritura-en-hubspot-server";
import { loQueLeFaltaComprarDeLaEmpresa } from "@/lib/clients/lo-que-le-falta-comprar-server";

const SIN_SQL = "Falta aplicar scripts/sql/2026-10-25-datos-de-la-empresa.sql y reiniciar.";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acceso = await guardAccessToClient(id);
  if (acceso instanceof NextResponse) return acceso;
  try {
    const [datos, snapshot, manuales, investigacion, corrida, puedeDecidir] = await Promise.all([
      leerDatosDeLaEmpresa(id),
      prisma.clientPartnerSnapshot.findUnique({ where: { clientId: id }, select: { properties: true, fetchedAt: true } }),
      // Lo cargado a mano en «Licencias» (LicenciaCliente): la misma regla que esa pestaña y la cartera.
      prisma.licenciaCliente.findMany({ where: { clientId: id } }),
      ultimaInvestigacion(id),
      corridaDeLaInvestigacion(id),
      acceso.user.teamMember ? can(acceso.user.teamMember, "clientes", "decidirDatos") : Promise.resolve(false),
    ]);
    if (!datos) return NextResponse.json({ error: "La empresa no existe." }, { status: 404 });
    const yaPaga = loQueYaPaga(snapshot, manuales);
    // Lo que le falta sale de cómo es la empresa HOY, no del monto guardado: aunque una persona haya corregido el TAM,
    // los hubs que le sirven son los mismos.
    const leFalta = loQueLeFalta(calcularTamV1(datos.entradaDelTam), yaPaga);
    // R12: los casos que la moverían y no tiene (la escala y sus casos de uso; sin escala, los hubs que le faltan).
    const leFaltaComprar = await loQueLeFaltaComprarDeLaEmpresa(id, leFalta);
    const { entradaDelTam: _entrada, ...paraLaPantalla } = datos;
    void _entrada;
    return NextResponse.json({ ...paraLaPantalla, yaPaga, leFalta, leFaltaComprar, investigacion, corrida, puedeDecidir });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: SIN_SQL }, { status: 503 });
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acceso = await guardAccessToClient(id);
  if (acceso instanceof NextResponse) return acceso;
  const tm = acceso.user.teamMember;
  if (!tm) return NextResponse.json({ error: "Solo el equipo edita los datos de la empresa." }, { status: 403 });

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const parsed = EdicionDeDatoSchema.safeParse(cuerpo);
  if (!parsed.success) return NextResponse.json({ error: "Dato inválido.", detalle: parsed.error.issues }, { status: 400 });

  try {
    const puedeDecidir = await can(tm, "clientes", "decidirDatos");
    const r = await proponerDato({
      clientId: id,
      clave: parsed.data.clave,
      valor: parsed.data.valor,
      fuente: "persona",
      autorId: tm.id,
      cita: parsed.data.cita ?? null,
      puedeDecidir,
    });
    // Después de la transacción: un HubSpot caído no deshace lo que quedó en Nexus.
    const hubspot = await escribirEnHubspot(id, r);
    return NextResponse.json({ resultado: r, hubspot });
  } catch (e) {
    if (e instanceof ErrorDeDato) return NextResponse.json({ error: e.message }, { status: e.status });
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: SIN_SQL }, { status: 503 });
    throw e;
  }
}
