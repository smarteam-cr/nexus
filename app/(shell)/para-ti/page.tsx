/**
 * /para-ti — lo que le toca a cada persona en Nexus (2026-10-04, diseño «Notificaciones · diseño»).
 *
 * Sin gate: es de todo el equipo interno, y no muestra nada que la persona no pueda abrir. Junta lo que hoy está
 * repartido en cada módulo (su «Qué sigue» y su «Necesitan atención») recortado a lo SUYO —sus proyectos, sus
 * preventas, lo que le devolvieron— y a sus FRENTES («Lo que llevas», que se eligen en Equipo). A la derecha, los
 * AVISOS: lo que pasó.
 *
 * Mide fresco en cada visita (`medirParaTi`) y deja la medición guardada para el número del menú.
 */
import { requireInternalUser } from "@/lib/auth/supabase";
import { EmptyState, PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { accesoParaFrentes, alcanceDe, tienePermiso } from "@/lib/para-ti/alcance-server";
import { medirParaTi } from "@/lib/para-ti/medir-server";
import { avisosDe } from "@/lib/para-ti/avisos-server";
import { frente, puedeLlevar } from "@/lib/para-ti/frentes";
import { plural } from "@/lib/para-ti/armar";
import ParaTiPantalla from "@/components/para-ti/ParaTiPantalla";
import VentasDeParaTi, { type ModoDeVentas } from "@/components/para-ti/VentasDeParaTi";
import { Alert } from "@/components/ui";
import { crDateParts } from "@/lib/jobs/time";
import { vistaDeVentasDelPedido } from "@/lib/ventas/vista-del-pedido";
import { cierresMasCerca, cuandoEs, diasHasta, fechaLarga, preguntaDelNegocio, saludo } from "@/lib/ventas/negocios";

export const dynamic = "force-dynamic";

export default async function ParaTiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const ctx = await requireInternalUser().catch(() => null);
  // Sin sesión, el shell ya mandó al inicio. Esto es una cuenta que entra pero no es del equipo: un mensaje, no un
  // redirect (el inicio la vuelve a mandar acá y quedaría dando vueltas).
  if (!ctx) {
    return (
      <div className={SHELL_DEFAULT}>
        <EmptyState title="«Para ti» es del equipo de Smarteam" description="Tu cuenta no está vinculada a una persona del equipo." />
      </div>
    );
  }
  const alcance = await alcanceDe(ctx.teamMember);
  const ahora = new Date();
  const reloj = crDateParts(ahora);
  const hoyISO = reloj.dateKey;
  // Lo de Ventas (2026-10-14, docs/mi-dia-plan.md): a quien tiene negocios abiertos, empresas a su nombre o una meta.
  const ventas = tienePermiso(alcance, "ventas", "read")
    ? await vistaDeVentasDelPedido(alcance.teamMemberId, alcance.email, hoyISO, ahora)
    : null;
  const modo: ModoDeVentas = ventas?.estado === "ok" && uno(sp.vista) === "cartera" ? "cartera" : "dia";
  const [medicion, avisos] = await Promise.all([medirParaTi(alcance, ahora), avisosDe(alcance.email)]);

  // Un frente que llevas sin el permiso para abrirlo se calla (lib/para-ti/frentes.ts): se dice, para que no parezca
  // que está al día.
  const acceso = accesoParaFrentes(alcance);
  const llegan = alcance.frentes.filter((f) => puedeLlevar(frente(f), acceso));
  const callados = alcance.frentes.filter((f) => !llegan.includes(f));
  const partes: string[] = [];
  if (alcance.proyectos.length) partes.push(`De tus ${plural(alcance.proyectos.length, "proyecto", "proyectos")} de implementación`);
  if (llegan.length) partes.push(`${partes.length ? "y de lo que llevas" : "De lo que llevas"}: ${llegan.map((f) => frente(f).nombre).join(", ")}`);
  const sinPermiso = callados.length
    ? ` Lo de ${callados.map((f) => `«${frente(f).nombre}»`).join(", ")} no te llega hasta que tengas el permiso.`
    : "";
  const resumen = `${partes.length ? `${partes.join(" ")}.` : "De lo tuyo en Nexus. En Equipo se elige qué más seguir."}${sinPermiso}`;

  // El saludo y la fecha (pedido de Elías, 2026-10-15): «Buenos días, Andrés» y «Jueves 15 de octubre», más una línea
  // con lo del día. A quien vende, lo de sus negocios; al resto, lo de «Para ti».
  const nombre = alcance.nombre.trim().split(/\s+/)[0] ?? alcance.nombre;
  const delDia: string[] = [];
  if (ventas?.estado === "ok") {
    const v = ventas.vista;
    const esteMes = cierresMasCerca(v.negocios, hoyISO).filter((n) => n.fechaCierre!.slice(0, 7) === hoyISO.slice(0, 7)).length;
    const preguntas = v.negocios.filter((n) => preguntaDelNegocio(n, hoyISO, ahora)).length;
    const proxima = v.negocios
      .filter((n) => n.proximaActividad && Date.parse(n.proximaActividad) >= ahora.getTime())
      .sort((a, b) => Date.parse(a.proximaActividad!) - Date.parse(b.proximaActividad!))[0];
    if (esteMes) delDia.push(`${plural(esteMes, "cierre", "cierres")} este mes`);
    if (preguntas) delDia.push(`${plural(preguntas, "negocio", "negocios")} por completar`);
    if (proxima && diasHasta(proxima.proximaActividad!.slice(0, 10), hoyISO) <= 7) {
      delDia.push(`tu próxima actividad: ${proxima.empresa}, ${cuandoEs(proxima.proximaActividad!, hoyISO)}`);
    }
  }
  const paraHoy = medicion.agente.length + medicion.hoy.length;
  if (ventas?.estado !== "ok" && paraHoy) delDia.push(`${plural(paraHoy, "cosa", "cosas")} para hoy en Nexus`);
  const lineaDelDia = delDia.length ? `${delDia.join(" · ")}.` : "Nada urgente por hoy.";

  return (
    <div className={`${SHELL_DEFAULT} space-y-6`}>
      <PageHeader title={`${saludo(reloj.hour)}, ${nombre}`} description={`${fechaLarga(hoyISO)} · ${lineaDelDia}`} />
      {ventas?.estado === "sin-tabla" && (
        <Alert variant="warning">Los negocios de HubSpot todavía no se pueden mostrar: falta aplicar scripts/sql/2026-10-14-negocios-abiertos.sql.</Alert>
      )}
      {ventas?.estado === "ok" && (
        <VentasDeParaTi vista={ventas.vista} modo={modo} hoyISO={hoyISO} ahoraISO={ahora.toISOString()} negocioAbierto={uno(sp.negocio)} />
      )}
      {modo === "dia" && <ParaTiPantalla medicion={medicion} avisos={avisos} resumen={resumen} />}
    </div>
  );
}
