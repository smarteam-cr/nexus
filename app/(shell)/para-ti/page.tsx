/**
 * /para-ti — el inicio de cada persona en Nexus (2026-10-04; rediseño de la ficha D, 2026-10-17, diseño «Para ti ·
 * Ventas y CSE»).
 *
 * Sin gate: es de todo el equipo interno, y no muestra nada que la persona no pueda abrir. Cada equipo ve su inicio
 * (lib/mi-dia/inicio.ts, del registro de equipos):
 *   · Ventas: la agenda, lo que importa hoy, su meta y su pipeline, y «Tu cartera».
 *   · CSE: la agenda, lo que importa hoy y sus cuentas con su acción de la semana y su reunión de los próximos 8 días;
 *     en «Tu cartera», sus empresas con sus proyectos de HubSpot (components/para-ti/CarteraDeCustomerSuccess.tsx).
 *   · CSL: lo mismo, con toda la cartera («La cartera»). Customer Success no ve la cartera de Ventas (2026-10-17).
 *   · Desarrollo: los clientes con proyecto de desarrollo activo.
 *   · Marketing: sus tareas internas (Smarteam, SmartAgro).
 *   · Los demás (dirección, Finanzas): la agenda, lo que importa hoy, las tareas de hoy y los avisos.
 *
 * Mide fresco en cada visita (`medirParaTi`) y deja la medición guardada para el número del menú.
 */
import { requireInternalUser } from "@/lib/auth/supabase";
import Link from "next/link";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { ENLACE_BLANCO } from "@/components/carga/piezas";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { equipoDeRol, veLaAgenda } from "@/lib/equipos/registro";
import { agendaDeLaVista, agendaDelDiaDe } from "@/lib/mi-dia/agenda-server";
import { diaDeEntradaDeLaAgenda, diaQueSeVe, lunesDeLaAgenda, vistaPedidaDeLaAgenda } from "@/lib/mi-dia/agenda-dias";
import { cuentasDelInicio, tareasDeHoy, tareasInternas, tareasParaLosHuecos } from "@/lib/mi-dia/inicio-server";
import { horaCR, huecoLibre, resumenDelDia, reunionesDelDia, varianteDelInicio } from "@/lib/mi-dia/inicio";
import { cifrasDelInicio, siguienteMovimiento } from "@/lib/mi-dia/cifras";
import { accesoParaFrentes, alcanceDe, tienePermiso } from "@/lib/para-ti/alcance-server";
import { medirParaTi } from "@/lib/para-ti/medir-server";
import { avisosDe } from "@/lib/para-ti/avisos-server";
import { frente, puedeLlevar } from "@/lib/para-ti/frentes";
import VentasDeParaTi from "@/components/para-ti/VentasDeParaTi";
import InicioDelDia from "@/components/para-ti/inicio/InicioDelDia";
import SelectorDelInicio from "@/components/para-ti/inicio/SelectorDelInicio";
import TusCuentasDelInicio from "@/components/para-ti/inicio/TusCuentasDelInicio";
import CarteraDeCustomerSuccess from "@/components/para-ti/CarteraDeCustomerSuccess";
import { cargarCarteraDeCs, cuantasEmpresasDeCs, tieneCarteraDeCs } from "@/lib/mi-dia/cartera-cs-server";
import { crDateParts } from "@/lib/jobs/time";
import { vistaDeVentasDelPedido } from "@/lib/ventas/vista-del-pedido";
import { fechaLarga, saludo } from "@/lib/ventas/negocios";

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

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
  // Customer Success (el CSE y la CSL) tiene su propia cartera (2026-10-17): no ve la de Ventas aunque tenga el
  // permiso. Si su inicio no depende de tener ventas (lo dice su rol), ni se piden.
  const varianteSin = varianteDelInicio({ rol: alcance.rol, frentes: alcance.frentes, tieneVentas: false });
  const esDeCs = tieneCarteraDeCs(varianteSin) && varianteDelInicio({ rol: alcance.rol, frentes: alcance.frentes, tieneVentas: true }) === varianteSin;
  // Lo de Ventas (2026-10-14, docs/mi-dia-plan.md): a quien tiene negocios abiertos, empresas a su nombre o una meta.
  const ventas = !esDeCs && tienePermiso(alcance, "ventas", "read")
    ? await vistaDeVentasDelPedido(alcance.teamMemberId, alcance.email, hoyISO, ahora)
    : null;
  const vistaDeVentas = ventas?.estado === "ok" ? ventas.vista : null;
  const variante = varianteDelInicio({ rol: alcance.rol, frentes: alcance.frentes, tieneVentas: !!vistaDeVentas });
  const conCuentas = variante === "cse" || variante === "csl" || variante === "dev";
  const carteraDeCs = tieneCarteraDeCs(variante) ? variante : null;
  const pedida = uno(sp.vista);
  const modo: "dia" | "cartera" | "cuentas" =
    vistaDeVentas && pedida === "cartera"
      ? "cartera"
      : carteraDeCs && (pedida === "cartera" || pedida === "cuentas")
        ? "cartera"
        : conCuentas && !carteraDeCs && pedida === "cuentas"
          ? "cuentas"
          : "dia";

  // La agenda: la semana (o el día, con `?agenda=dia`) de `?dia=`, hoy por defecto. Es de lunes a viernes: un sábado o
  // un domingo abre en la semana que viene (lib/mi-dia/agenda-dias.ts). Moverse por la agenda ya no vuelve a pedir esta
  // página: lo hace la agenda con /api/para-ti/agenda.
  const veAgenda = veLaAgenda(alcance.rol);
  const vistaDeLaAgenda = vistaPedidaDeLaAgenda(uno(sp.agenda));
  const semana = vistaDeLaAgenda === "semana";
  const diaPedido = uno(sp.dia);
  const diaVisto = diaPedido && DIA.test(diaPedido) ? diaQueSeVe(vistaDeLaAgenda, diaPedido) : diaDeEntradaDeLaAgenda(hoyISO, vistaDeLaAgenda);
  const enlace = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const x = uno(v);
      if (x && !["negocio"].includes(k)) p.set(k, x);
    }
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const q = p.toString();
    return q ? `/para-ti?${q}` : "/para-ti";
  };

  const enLaCarteraDeCs = carteraDeCs && modo === "cartera";
  // Lo de hoy (los números, el resumen y la reunión que se abre sola). Si la agenda muestra hoy o su semana, sale de
  // ahí; si muestra otro día u otra semana, la de hoy se pide aparte, en paralelo con lo demás.
  const mostrandoHoy = semana ? diaVisto === lunesDeLaAgenda(hoyISO) : diaVisto === hoyISO;
  const [medicion, avisos, agenda, cuentas, hoy, internas, cartera, empresasDeCs, paraLosHuecos, otraAgendaDeHoy] = await Promise.all([
    medirParaTi(alcance, ahora),
    avisosDe(alcance.email),
    veAgenda && modo === "dia"
      ? agendaDeLaVista(alcance.email, vistaDeLaAgenda, diaVisto, { fresco: true }).catch(() => null)
      : Promise.resolve(null),
    // En la cartera de CS, las cuentas del inicio no se usan: la cartera trae lo suyo.
    conCuentas && !enLaCarteraDeCs ? cuentasDelInicio(variante, alcance, { ahora, hoyISO }).catch(() => []) : Promise.resolve([]),
    tareasDeHoy(alcance.email, hoyISO).catch(() => ({ tareas: [], total: 0 })),
    variante === "marketing" ? tareasInternas(alcance.email, equipoDeRol(alcance.rol)?.sprint ?? null).catch(() => null) : Promise.resolve(null),
    enLaCarteraDeCs ? cargarCarteraDeCs(carteraDeCs, alcance, { ahora, hoyISO }).catch(() => null) : Promise.resolve(null),
    // El número del selector en «Tu día», sin cargar la cartera entera.
    carteraDeCs && !enLaCarteraDeCs ? cuantasEmpresasDeCs(carteraDeCs, alcance).catch(() => null) : Promise.resolve(null),
    // «Con qué avanzar» en los huecos libres de hoy: también si la agenda abre en otro día, porque se puede volver a hoy
    // sin recargar la página.
    veAgenda && modo === "dia" ? tareasParaLosHuecos(alcance.email, hoyISO).catch(() => []) : Promise.resolve([]),
    veAgenda && modo === "dia" && !mostrandoHoy ? agendaDelDiaDe(alcance.email, hoyISO, { fresco: true }).catch(() => null) : Promise.resolve(null),
  ]);

  // Un frente que llevas sin el permiso para abrirlo se calla (lib/para-ti/frentes.ts): se dice, para que no parezca
  // que está al día.
  const acceso = accesoParaFrentes(alcance);
  const callados = alcance.frentes.filter((f) => !puedeLlevar(frente(f), acceso));

  const agendaDeHoy =
    !veAgenda || modo !== "dia"
      ? null
      : !mostrandoHoy
        ? otraAgendaDeHoy
        : semana && agenda
          ? { ...agenda, dia: hoyISO, reuniones: reunionesDelDia(agenda.reuniones, hoyISO) }
          : agenda;
  const reunionesDeHoy = agendaDeHoy?.estado === "ok" ? agendaDeHoy.reuniones : [];
  const proxima = reunionesDeHoy.find((r) => r.empresas.length > 0 && Date.parse(r.inicio) > ahora.getTime()) ?? null;
  const hueco = agendaDeHoy?.estado === "ok" ? huecoLibre(reunionesDeHoy, hoyISO, ahora) : null;
  const lasQueLlevo = variante === "cse" ? new Set(alcance.proyectos.filter((p) => p.encargado).map((p) => p.clientId)) : null;
  const resumen = resumenDelDia({
    proxima: proxima ? { hora: horaCR(proxima.inicio), titulo: proxima.titulo, empresa: proxima.empresas.length === 1 ? proxima.nombres[proxima.empresas[0]] : "un cliente" } : null,
    primero: medicion.importa[0] ? { titulo: medicion.importa[0].titulo } : null,
    delAgente: [...medicion.importa, ...medicion.tambien].filter((p) => p.delAgente).length,
    cuentasSinAccion: variante === "cse" ? cuentas.filter((c) => lasQueLlevo!.has(c.clientId) && c.servicio?.falta.length).map((c) => c.empresa) : [],
    hueco: hueco ? { hora: horaCR(hueco.inicio) } : null,
  });

  const cifras = cifrasDelInicio(variante, {
    reuniones: agendaDeHoy?.estado === "ok" ? agendaDeHoy.reuniones : null,
    veAgenda,
    ahora,
    importa: medicion.importa.length,
    tambien: medicion.tambien.length,
    semana: medicion.semana.length,
    avisosNuevos: avisos.filter((a) => a.nuevo).length,
    cuentas,
    ventas: vistaDeVentas ? { meta: vistaDeVentas.meta, anio: vistaDeVentas.anio, ponderado: vistaDeVentas.ponderado } : null,
    tareas: internas ? { hoy: hoy.total, porDecidir: internas.porDecidir, internas: internas.tareas.filter((t) => t.interna).length } : null,
  });

  const nombre = alcance.nombre.trim().split(/\s+/)[0] ?? alcance.nombre;
  const otra = vistaDeVentas
    ? { clave: "cartera", etiqueta: "Tu cartera", cuenta: vistaDeVentas.empresas.length }
    : carteraDeCs
      ? { clave: "cartera", etiqueta: carteraDeCs === "csl" ? "La cartera" : "Tu cartera", cuenta: cartera?.empresas.length ?? empresasDeCs ?? cuentas.length }
      : conCuentas
      ? { clave: "cuentas", etiqueta: variante === "csl" ? "La cartera" : variante === "dev" ? "Clientes con desarrollo" : "Tus cuentas", cuenta: cuentas.length }
      : null;

  return (
    <div className={`${SHELL_DEFAULT} space-y-6`}>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <PageHeader
          title={`${saludo(reloj.hour)}, ${nombre}`}
          description={`${fechaLarga(hoyISO)} · ${horaCR(ahora.toISOString())}`}
          action={
            <div className="flex flex-wrap items-center gap-3">
              {otra && <SelectorDelInicio valor={modo} otra={otra} />}
              {/* El correo de la mañana en vista previa (etapa 4e): todavía no se envía. */}
              <Link href="/para-ti/correo" className={ENLACE_BLANCO}>
                Correo de la mañana
              </Link>
              {/* «Uso de Nexus» es de dirección (etapa 4a): cómo se usa Nexus, por equipo y por persona. */}
              {ctx.role === "SUPER_ADMIN" && (
                <Link href="/para-ti/uso" className={ENLACE_BLANCO}>
                  Uso de Nexus
                </Link>
              )}
            </div>
          }
        />
        {ventas?.estado === "sin-tabla" && (
          <Alert variant="warning">Los negocios de HubSpot todavía no se pueden mostrar: falta aplicar scripts/sql/2026-10-14-negocios-abiertos.sql.</Alert>
        )}
        {callados.length > 0 && (
          <p className="text-xs text-fg-muted">Lo de {callados.map((f) => `«${frente(f).nombre}»`).join(", ")} no te llega hasta que tengas el permiso.</p>
        )}

        {vistaDeVentas && (
          <VentasDeParaTi vista={vistaDeVentas} modo={modo === "cartera" ? "cartera" : "dia"} hoyISO={hoyISO} ahoraISO={ahora.toISOString()} negocioAbierto={uno(sp.negocio)} />
        )}

        {enLaCarteraDeCs &&
          (cartera ? (
            <CarteraDeCustomerSuccess cartera={cartera} hoyISO={hoyISO} />
          ) : (
            <Alert variant="danger">No se pudo cargar la cartera. Vuelve a intentarlo en un momento.</Alert>
          ))}

        {modo === "cuentas" && (
          <TusCuentasDelInicio
            cuentas={cuentas}
            titulo={variante === "csl" ? "La cartera" : variante === "dev" ? "Clientes con desarrollo" : "Tus cuentas"}
            max={null}
            verTodas={null}
            conQuienLaLleva={variante !== "cse"}
            hoyISO={hoyISO}
          />
        )}

        {modo === "dia" && (
          <InicioDelDia
            d={{
              variante,
              hoyISO,
              ahoraISO: ahora.toISOString(),
              correo: alcance.email,
              cifras,
              resumen,
              medicion,
              avisos,
              agenda:
                veAgenda && agenda
                  ? {
                      datos: agenda,
                      vista: vistaDeLaAgenda,
                      dia: diaVisto,
                    }
                  : null,
              cuentas,
              verLasCuentas: conCuentas ? enlace({ vista: carteraDeCs ? "cartera" : "cuentas", dia: null, agenda: null }) : null,
              tareasDeHoy: hoy,
              tareasInternas: internas?.tareas ?? null,
              movimiento: vistaDeVentas
                ? { ...siguienteMovimiento(vistaDeVentas.negocios, hoyISO, ahora), verPipeline: "/para-ti?vista=cartera&cartera=pipeline" }
                : null,
              abrirDeEntrada: mostrandoHoy ? (proxima?.id ?? null) : null,
              paraLosHuecos,
            }}
          />
        )}
      </div>
    </div>
  );
}
