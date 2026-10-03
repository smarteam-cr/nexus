/**
 * GET /api/sales/exploraciones/[id]/preparacion — los HECHOS de HubSpot para la pieza Preparación.
 *
 * La ficha de la empresa, sus contactos con su rastro (teléfono, de dónde llegó, el último
 * formulario, sus visitas, si agendó) y cuál es el contacto principal. Se lee al abrir la pieza, sin
 * guardar nada: son datos de HubSpot y se muestran como están ahí. Lo que interpreta (el «por qué
 * ahora», la radiografía, la hipótesis de valor) lo propone el agente en sus casillas.
 * Pide `ventas.read`. Solo lee HubSpot.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { leerContactos, leerEmpresa } from "@/lib/exploraciones/hubspot";
import { leerLoLeido } from "@/lib/exploraciones/lo-leido";
import { contactoPrincipal, type ContactoConRastro } from "@/lib/exploraciones/senales";
import { leerExploracion } from "@/lib/exploraciones/servidor";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPermission("ventas", "read");
  if (guard instanceof NextResponse) return guard;

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
  const companyId = lectura.fila.client.hubspotCompanyId;
  const leido = leerLoLeido(lectura.fila.test);
  if (!companyId) return NextResponse.json({ empresa: null, contactos: [], principalId: null, tests: [], agenda: leido.agenda });

  const [empresa, crudos] = await Promise.all([leerEmpresa(companyId), leerContactos(companyId)]);
  if (!empresa) return NextResponse.json({ error: "No se pudo consultar HubSpot. Prueba de nuevo en un rato." }, { status: 502 });

  // Solo los de esta empresa: un contacto cuya empresa principal es otra no es de acá.
  const delTest = new Set(leido.tests.map((t) => t.contacto));
  const contactos: ContactoConRastro[] = crudos
    .filter((c) => !c.empresaId || c.empresaId === companyId)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      cargo: c.cargo,
      email: c.email,
      hizoElTest: !!c.estadoDelTest || Object.keys(c.urlsDelTest).length > 0 || delTest.has(c.nombre),
      rastro: c.rastro,
    }));

  return NextResponse.json({
    empresa: {
      nombre: empresa.nombre,
      dominio: empresa.dominio,
      sitio: empresa.sitio,
      industria: empresa.industria,
      pais: empresa.pais,
      ciudad: empresa.ciudad,
      empleados: empresa.empleados,
      descripcion: empresa.descripcion,
    },
    contactos,
    principalId: contactoPrincipal(contactos)?.id ?? null,
    tests: leido.tests.map((t) => ({ contacto: t.contacto, areaId: t.resultado.areaId, fecha: t.resultado.fecha })),
    agenda: leido.agenda,
  });
}
