/**
 * /para-ti/uso — «Uso de Nexus», para dirección (etapa 4a de docs/mi-dia-plan.md, diseño «Uso de Nexus», v4).
 *
 * Seis pestañas: Equipo (las aperturas del latido, por persona, día y equipo), Para qué se usa (lo que propone Nexus y
 * qué pasó con eso, por módulo, tipo y equipo), IA por cliente (cuánta IA se gastó por empresa y qué se usó de lo que
 * propuso ahí), Procesos de IA (por proceso: costo, corridas, fallos y qué se usa), Conclusiones (una lectura con reglas)
 * y Reuniones sin grabar. Solo SUPER_ADMIN: el detalle por persona es dato sensible. En orden alfabético, sin ranking, y
 * el gasto de IA nunca por persona.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireInternalUser } from "@/lib/auth/supabase";
import { EmptyState, PageHeader } from "@/components/ui";
import { ChipDeCabecera } from "@/components/cs/piezas";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { cn } from "@/lib/cn";
import { quienEsQuien, reunionesSinGrabar, usoDelEquipo, DIAS_DE_REUNIONES_SIN_GRABAR, type UsoDelEquipo as DatosDelEquipo } from "@/lib/uso/lectura-server";
import { usoDeLoPropuesto, type ResumenDeUso } from "@/lib/lo-propuesto/uso-server";
import { itemsDeLoPropuesto } from "@/lib/lo-propuesto/registro-server";
import { NOMBRE_DEL_MODULO, type ModuloDeLoPropuesto } from "@/lib/lo-propuesto/tipos";
import { datosDeIa } from "@/lib/uso/ia-server";
import { decisionesPorEquipo } from "@/lib/uso/agrupar";
import { concluir } from "@/lib/uso/conclusiones";
import UsoDelEquipo from "@/components/uso/UsoDelEquipo";
import PestanasDeUso from "@/components/uso/PestanasDeUso";
import { ConclusionesDeUso, IaPorCliente, ProcesosDeIa } from "@/components/uso/IaDeNexus";
import { Tabla } from "@/components/uso/piezas";
import { DIAS_POSIBLES, VISTAS_DE_USO, type DiasDeIa, type VistaDeUso } from "@/lib/uso/vistas";

export const dynamic = "force-dynamic";

const DIA_MS = 86_400_000;
const DIAS_DE_LO_PROPUESTO = 30;

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function UsoDeNexusPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  if (ctx.role !== "SUPER_ADMIN") redirect("/para-ti");
  const sp = await searchParams;
  const pedida = primero(sp.vista);
  const vista: VistaDeUso = VISTAS_DE_USO.includes(pedida as VistaDeUso) ? (pedida as VistaDeUso) : "equipo";
  const diasPedidos = Number(primero(sp.dias));
  const dias: DiasDeIa = DIAS_POSIBLES.includes(diasPedidos as DiasDeIa) ? (diasPedidos as DiasDeIa) : 30;
  const ahora = new Date();

  const sinGrabar = await reunionesSinGrabar(ahora).catch(() => null);

  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeader
        title="Uso de Nexus"
        backHref="/para-ti"
        backLabel="Para ti"
        badges={<ChipDeCabecera>Solo dirección</ChipDeCabecera>}
        description="Cómo se usa Nexus, por equipo, por cliente y por proceso. Sirve para entender el uso, no para evaluar a nadie."
      />
      <PestanasDeUso vista={vista} dias={dias} sinGrabar={sinGrabar?.organizadores.filter((o) => o.nombre).length ?? null} />
      {vista === "equipo" && <UsoDelEquipo datos={await usoDelEquipo(ahora)} />}
      {vista === "propuesto" && <ParaQueSeUsa ahora={ahora} />}
      {vista === "clientes" && <IaPorCliente datos={await datosDeIa(dias, ahora)} />}
      {vista === "procesos" && <ProcesosDeIa datos={await datosDeIa(dias, ahora)} />}
      {vista === "conclusiones" && <Conclusiones ahora={ahora} dias={dias} />}
      {vista === "reuniones" && <ReunionesSinGrabar datos={sinGrabar} />}
    </div>
  );
}

/** Los días con medición dentro de la ventana de 4 semanas: desde el primer registro (o el primer día) hasta hoy. */
function diasMedidos(e: DatosDelEquipo): number {
  const desde = e.medidoDesde && e.medidoDesde > e.dias[0] ? e.medidoDesde : e.dias[0];
  return e.dias.filter((d) => d >= desde && d <= e.hoy).length;
}

async function Conclusiones({ ahora, dias }: { ahora: Date; dias: DiasDeIa }) {
  const desde = new Date(ahora.getTime() - dias * DIA_MS);
  const [equipo, ia] = await Promise.all([usoDelEquipo(ahora), datosDeIa(dias, ahora)]);
  const propuesto = await usoDeLoPropuesto({ desde, hasta: ahora, ahora, items: ia.itemsPorTipo });
  const conclusiones = concluir({
    equipo: equipo.faltaLaTabla ? null : { personas: equipo.personas, diasMedidos: diasMedidos(equipo) },
    propuesto: propuesto.porTipo,
    ia: ia.faltaLaTabla
      ? null
      : {
          dias,
          total: ia.resumen.total,
          sinCliente: ia.resumen.sinCliente,
          porProceso: ia.resumen.porProceso,
          propuestoPorProceso: ia.propuestoPorProceso,
          corridasConError: ia.corridasConError,
          llegoAlTope: ia.llegoAlTope,
        },
  });
  return <ConclusionesDeUso conclusiones={conclusiones} dias={dias} />;
}

const MODULOS: readonly ModuloDeLoPropuesto[] = ["reuniones", "clientes", "exito", "tareas"];

async function ParaQueSeUsa({ ahora }: { ahora: Date }) {
  const desde = new Date(ahora.getTime() - DIAS_DE_LO_PROPUESTO * DIA_MS);
  const ventana = { desde, hasta: ahora };
  const [items, quien] = await Promise.all([itemsDeLoPropuesto({ ...ventana, ahora }), quienEsQuien()]);
  const r = await usoDeLoPropuesto({ ...ventana, ahora, conPersonas: true, items });
  if (r.total.nacieron === 0 && r.total.deAntes === 0) {
    return <EmptyState title="Nada propuesto en 30 días" description="Cuando Nexus proponga algo (una minuta, una tarea, un campo de la ficha) se cuenta acá." />;
  }
  const equipos = decisionesPorEquipo(items, ventana, (email) => quien.porCorreo.get(email)?.equipo ?? null, quien.orden);
  const filas = [...r.porModulo.map((m) => ({ ...m, clave: m.modulo as string })), { ...r.total, clave: "total", nombre: "Todo" }];
  return (
    <div className="space-y-6">
      <p className="text-[13px] text-fg-secondary">
        Lo que Nexus propuso en los últimos {DIAS_DE_LO_PROPUESTO} días y cómo está hoy. <span className="text-fg-muted">Vence lo que nadie decidió en su plazo.</span>
      </p>
      <Tabla
        titulo="Por módulo"
        columnas={["Propuesto", "Usado", "Desestimado", "Venció", "Pendiente"]}
        filas={filas.map((f) => ({
          clave: f.clave,
          nombre: f.nombre,
          resaltada: f.clave === "total",
          valores: [f.nacieron, f.usados, f.desestimados, f.vencidos, f.pendientes],
        }))}
      />
      {equipos.length > 0 && (
        <Tabla
          titulo="Qué usa y qué desestima cada equipo"
          nota="Cuenta quién decidió. «12 · 3» = usó 12 y desestimó 3."
          columnas={[...MODULOS.map((m) => NOMBRE_DEL_MODULO[m]), "Desestima"]}
          anchoColumna={120}
          filas={equipos.map((e) => {
            const decididas = e.usados + e.desestimados;
            return {
              clave: e.equipo,
              nombre: e.equipo,
              valores: [
                ...MODULOS.map((m) => {
                  const c = e.porModulo[m];
                  return c ? `${c.usados} · ${c.desestimados}` : "—";
                }),
                decididas ? `${Math.round((e.desestimados / decididas) * 100)} %` : "—",
              ],
            };
          })}
        />
      )}
      <Tabla
        titulo="Por tipo"
        columnas={["Propuesto", "Usado", "Desestimado", "Venció", "Pendiente"]}
        filas={r.porTipo
          .filter((t) => t.nacieron > 0 || t.deAntes > 0)
          .map((t) => ({ clave: t.tipo, nombre: t.nombre, valores: [t.nacieron, t.usados, t.desestimados, t.vencidos, t.pendientes] }))}
      />
      <QuienDecide resumen={r} quien={quien} />
      {r.total.sinFirma > 0 && (
        <p className="text-xs text-fg-muted">
          {r.total.sinFirma} se cerraron sin una persona detrás (por ejemplo, las cerró el sistema): cuentan como usadas o
          desestimadas, pero no tienen a quién.
        </p>
      )}
    </div>
  );
}

/** Quién decide lo propuesto, agrupado por equipo y en orden alfabético dentro de cada uno. Sin ranking. */
function QuienDecide({ resumen, quien }: { resumen: ResumenDeUso; quien: Awaited<ReturnType<typeof quienEsQuien>> }) {
  if (!resumen.porPersona?.length) return null;
  const filas = resumen.porPersona
    .map((p) => {
      const q = quien.porCorreo.get(p.persona.toLowerCase());
      return { ...p, nombre: q ? `${q.nombre}${q.activo ? "" : " (ya no está)"}` : p.persona, equipo: q?.equipo ?? "Fuera del equipo" };
    })
    .sort((a, b) => {
      const pa = quien.orden.indexOf(a.equipo);
      const pb = quien.orden.indexOf(b.equipo);
      return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb) || a.nombre.localeCompare(b.nombre);
    });
  return (
    <Tabla
      titulo="Quién decide (por equipo, en orden alfabético)"
      columnas={["Usó", "Desestimó"]}
      filas={filas.map((p, i) => ({
        clave: p.persona,
        nombre:
          i === 0 || filas[i - 1].equipo !== p.equipo ? (
            <span>
              <span className="mr-2 text-xs font-semibold text-fg-secondary">{p.equipo}</span>
              {p.nombre}
            </span>
          ) : (
            p.nombre
          ),
        valores: [p.usados, p.desestimados],
      }))}
    />
  );
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (dia: string) => `${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]}`;

function ReunionesSinGrabar({ datos }: { datos: Awaited<ReturnType<typeof reunionesSinGrabar>> | null }) {
  if (!datos) return <EmptyState title="No se pudo leer" description="Las reuniones no se pudieron leer ahora. Vuelve a intentarlo en un rato." />;
  if (datos.sinTranscripcion === 0) {
    return (
      <EmptyState
        title="Todas quedaron grabadas"
        description={`Las ${datos.conClientes} reuniones con clientes de los últimos ${DIAS_DE_REUNIONES_SIN_GRABAR} días dejaron su transcripción.`}
      />
    );
  }
  const delEquipo = datos.organizadores.filter((o) => o.nombre);
  const deAfuera = datos.organizadores.filter((o) => !o.nombre);
  return (
    <div className="space-y-6">
      <p className="text-[13px] text-fg-secondary">
        De {datos.conClientes} reuniones con clientes y prospectos desde el {fechaCorta(datos.desde)},{" "}
        <span className="font-semibold text-fg">{datos.sinTranscripcion} no dejaron transcripción</span>. Sin ella, Nexus
        solo lee las notas de Gemini, si hay. Se arregla en Google Workspace: la transcripción se activa en la cuenta de
        quien organiza la reunión.
      </p>
      {delEquipo.length > 0 && <Organizadores titulo="Las organizó alguien del equipo" lista={delEquipo} />}
      {deAfuera.length > 0 && (
        <Organizadores
          titulo="Las organizó alguien de afuera"
          lista={deAfuera}
          nota="Si las organiza el cliente, la transcripción depende de su cuenta: agrégalas a mano con «+ Reunión»."
        />
      )}
    </div>
  );
}

function Organizadores({
  titulo,
  lista,
  nota,
}: {
  titulo: string;
  lista: Awaited<ReturnType<typeof reunionesSinGrabar>>["organizadores"];
  nota?: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
        {nota && <span className="text-xs text-fg-muted">{nota}</span>}
      </div>
      <div className="divide-y divide-line rounded-xl border border-line bg-surface">
        {lista.map((o) => (
          <div key={o.email} className="space-y-1 px-4 py-3 text-[13px]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-fg">{o.nombre ?? o.email}</span>
              <span className="tabular-nums text-fg-secondary">
                {o.sinTranscripcion} de {o.conClientes} sin transcripción
                {o.sinNada > 0 && <span className="text-warn-ink"> · {o.sinNada} sin notas tampoco</span>}
              </span>
            </div>
            <ul className="space-y-0.5 text-xs text-fg-muted">
              {o.ejemplos.map((e) => (
                <li key={e.id}>
                  <Link href={`/sessions/${e.id}`} className="transition-colors hover:text-brand">
                    {fechaCorta(e.dia)} · {e.cliente} · {e.titulo}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
