/**
 * /para-ti/uso — «Uso de Nexus», para dirección (etapa 4a de docs/mi-dia-plan.md, diseño «Uso de Nexus · Equipo»).
 *
 * Tres pestañas: Equipo (las aperturas del latido, por persona y día), Para qué se usa (lo que propone Nexus y qué
 * pasó con eso, `usoDeLoPropuesto`) y Reuniones sin grabar (quién organiza reuniones con clientes que no dejan
 * transcripción). Solo SUPER_ADMIN: el detalle por persona es dato sensible. En orden alfabético, sin ranking.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireInternalUser } from "@/lib/auth/supabase";
import { EmptyState, PageHeader } from "@/components/ui";
import { ChipDeCabecera } from "@/components/cs/piezas";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { cn } from "@/lib/cn";
import { reunionesSinGrabar, usoDelEquipo, DIAS_DE_REUNIONES_SIN_GRABAR } from "@/lib/uso/lectura-server";
import { usoDeLoPropuesto } from "@/lib/lo-propuesto/uso-server";
import UsoDelEquipo from "@/components/uso/UsoDelEquipo";
import PestanasDeUso from "@/components/uso/PestanasDeUso";
import { VISTAS_DE_USO, type VistaDeUso } from "@/lib/uso/vistas";

export const dynamic = "force-dynamic";

const DIA_MS = 86_400_000;
const DIAS_DE_LO_PROPUESTO = 30;

export default async function UsoDeNexusPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  if (ctx.role !== "SUPER_ADMIN") redirect("/para-ti");
  const sp = await searchParams;
  const pedida = Array.isArray(sp.vista) ? sp.vista[0] : sp.vista;
  const vista: VistaDeUso = VISTAS_DE_USO.includes(pedida as VistaDeUso) ? (pedida as VistaDeUso) : "equipo";
  const ahora = new Date();

  const sinGrabar = await reunionesSinGrabar(ahora).catch(() => null);

  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeader
        title="Uso de Nexus"
        backHref="/para-ti"
        backLabel="Para ti"
        badges={<ChipDeCabecera>Solo dirección</ChipDeCabecera>}
        description="Cómo se usa Nexus, por equipo y por persona. Sirve para entender el uso, no para evaluar a nadie."
      />
      <PestanasDeUso vista={vista} sinGrabar={sinGrabar?.organizadores.filter((o) => o.nombre).length ?? null} />
      {vista === "equipo" && <UsoDelEquipo datos={await usoDelEquipo(ahora)} />}
      {vista === "propuesto" && <ParaQueSeUsa ahora={ahora} />}
      {vista === "reuniones" && <ReunionesSinGrabar datos={sinGrabar} />}
    </div>
  );
}

async function ParaQueSeUsa({ ahora }: { ahora: Date }) {
  const r = await usoDeLoPropuesto({ desde: new Date(ahora.getTime() - DIAS_DE_LO_PROPUESTO * DIA_MS), hasta: ahora, ahora, conPersonas: true });
  if (r.total.nacieron === 0 && r.total.deAntes === 0) {
    return <EmptyState title="Nada propuesto en 30 días" description="Cuando Nexus proponga algo (una minuta, una tarea, un campo de la ficha) se cuenta acá." />;
  }
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
      <Tabla
        titulo="Por tipo"
        columnas={["Propuesto", "Usado", "Desestimado", "Venció", "Pendiente"]}
        filas={r.porTipo
          .filter((t) => t.nacieron > 0 || t.deAntes > 0)
          .map((t) => ({ clave: t.tipo, nombre: t.nombre, valores: [t.nacieron, t.usados, t.desestimados, t.vencidos, t.pendientes] }))}
      />
      {r.porPersona && r.porPersona.length > 0 && (
        <Tabla
          titulo="Quién decide (en orden alfabético)"
          columnas={["Usó", "Desestimó"]}
          filas={r.porPersona.map((p) => ({ clave: p.persona, nombre: p.persona, valores: [p.usados, p.desestimados] }))}
        />
      )}
      {r.total.sinFirma > 0 && (
        <p className="text-xs text-fg-muted">
          {r.total.sinFirma} se cerraron sin una persona detrás (por ejemplo, las cerró el sistema): cuentan como usadas o
          desestimadas, pero no tienen a quién.
        </p>
      )}
    </div>
  );
}

function Tabla({
  titulo,
  columnas,
  filas,
}: {
  titulo: string;
  columnas: string[];
  filas: { clave: string; nombre: string; valores: number[]; resaltada?: boolean }[];
}) {
  const plantilla = { gridTemplateColumns: `minmax(0, 1fr) repeat(${columnas.length}, 96px)` };
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <div className="min-w-[560px]">
          <div className="grid gap-2 border-b border-line px-4 py-2 text-xs text-fg-muted" style={plantilla}>
            <span />
            {columnas.map((c) => (
              <span key={c} className="text-right">
                {c}
              </span>
            ))}
          </div>
          {filas.map((f, i) => (
            <div
              key={f.clave}
              className={cn("grid gap-2 px-4 py-2 text-[13px]", i > 0 && "border-t border-line", f.resaltada && "bg-surface-muted font-semibold")}
              style={plantilla}
            >
              <span className="truncate text-fg">{f.nombre}</span>
              {f.valores.map((v, j) => (
                <span key={j} className={cn("text-right tabular-nums", v === 0 ? "text-fg-muted" : "text-fg")}>
                  {v}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
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
