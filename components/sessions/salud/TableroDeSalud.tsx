/**
 * Las piezas del tablero de salud de las reuniones (T1, diseño «Salud de las reuniones» en Claude Design, aprobado por
 * Elías el 2026-10-25): los números del periodo, las filas por persona y por empresa (se abren con <details>, sin JS),
 * los motivos de las que no dejaron texto y las que esperan empresa. Solo tokens del tema; son hechos, no IA.
 */
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  HORAS_SIN_EMPRESA,
  META_DE_TEXTO,
  cuantoEspera,
  type Conteo,
  type EstadoDeLaReunion,
  type FilaDeLaSalud,
  type GrupoDeMotivos,
  type ReunionVista,
  type SinEmpresaVista,
} from "@/lib/sessions/salud-de-las-reuniones";
import type { DuenoDelArreglo } from "@/lib/google/por-que-falta";

const miles = (n: number) => n.toLocaleString("es-CR");
const pct = (n: number, de: number) => (de ? Math.round((100 * n) / de) : 0);
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }).replace(".", "");

const PUNTO: Record<"transcripcion" | "solo_notas" | "nada", string> = {
  transcripcion: "bg-success",
  solo_notas: "bg-fg-muted/40",
  nada: "bg-warning",
};

function Rotulo({ children, punto, punteado }: { children: React.ReactNode; punto?: string; punteado?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
      {punto && <span aria-hidden className={cn("h-2 w-2 rounded-full", punto)} />}
      {punteado && <span aria-hidden className="h-2 w-2 rounded-full border-[1.5px] border-dashed border-fg-muted" />}
      {children}
    </span>
  );
}

/* ── Los números del periodo ───────────────────────────────────────────────────────────── */

export function NumerosDelPeriodo({ c, soloTuyas, delEquipo, onVerMotivos }: { c: Conteo; soloTuyas: boolean; delEquipo?: number | null; onVerMotivos: string }) {
  const porcentaje = c.porcentaje ?? 0;
  return (
    <section aria-label="Resumen del periodo" className="flex flex-wrap gap-7 rounded-2xl border border-line bg-surface p-5">
      <div className="flex min-w-0 flex-[1.6_1_280px] flex-col gap-2">
        <Rotulo>{soloTuyas ? "Tus reuniones dejaron texto" : "Dejaron texto"}</Rotulo>
        <div className="flex items-baseline gap-2.5">
          <span className="text-[34px] font-light leading-[38px] tracking-tight text-brand">{c.porcentaje === null ? "—" : `${porcentaje} %`}</span>
          <span className="text-xs text-fg-muted">
            meta del equipo: {META_DE_TEXTO} %{soloTuyas && delEquipo != null ? ` · el equipo va en ${delEquipo} %` : ""}
          </span>
        </div>
        <div className="relative h-2 rounded-full bg-surface-muted">
          <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${porcentaje}%` }} />
          <div aria-hidden className="absolute -inset-y-1 w-0.5 rounded bg-fg" style={{ left: `${META_DE_TEXTO}%` }} />
        </div>
        <span className="text-xs text-fg-muted">
          {miles(c.conTexto)} de {miles(c.conEmpresa)} reuniones con empresa
          {!soloTuyas && c.porcentaje !== null && c.porcentaje < META_DE_TEXTO ? ` · faltan ${META_DE_TEXTO - c.porcentaje} puntos para la meta` : ""}
        </span>
      </div>
      <Numero rotulo={<Rotulo punto={PUNTO.transcripcion}>Con transcripción</Rotulo>} valor={c.transcripcion} nota={`${pct(c.transcripcion, c.conEmpresa)} % de las reuniones`} />
      <Numero rotulo={<Rotulo punto={PUNTO.solo_notas}>Solo notas</Rotulo>} valor={c.soloNotas} nota="De Gemini · cuentan como texto" />
      <Numero
        rotulo={<Rotulo punto={PUNTO.nada}>Sin nada</Rotulo>}
        valor={c.sinNada}
        nota={
          c.sinNada ? (
            <Link href={onVerMotivos} className="font-semibold text-brand hover:text-brand-dark">
              Ver por qué →
            </Link>
          ) : (
            "Ninguna"
          )
        }
      />
      <Numero
        rotulo={<Rotulo punteado>Sin empresa</Rotulo>}
        valor={c.sinEmpresa}
        nota={c.sinEmpresaVencidas ? <span className="font-semibold text-warn-ink">{c.sinEmpresaVencidas} con más de {HORAS_SIN_EMPRESA} h</span> : "Con texto, esperan empresa"}
      />
      <Numero
        rotulo={<Rotulo>Leídas</Rotulo>}
        valor={c.leidas}
        de={c.conTexto}
        nota="Ya tienen su minuta"
      />
    </section>
  );
}

function Numero({ rotulo, valor, de, nota }: { rotulo: React.ReactNode; valor: number; de?: number; nota: React.ReactNode }) {
  return (
    <div className="flex flex-[1_1_120px] flex-col gap-1.5">
      {rotulo}
      <span className="text-[26px] font-light leading-8 text-fg">
        {miles(valor)}
        {de !== undefined && <span className="text-sm text-fg-muted"> de {miles(de)}</span>}
      </span>
      <span className="text-xs text-fg-muted">{nota}</span>
    </div>
  );
}

/* ── El estado de una reunión ──────────────────────────────────────────────────────────── */

const CHIP: Record<EstadoDeLaReunion, { texto: string; clase: string }> = {
  transcripcion: { texto: "✓ Con transcripción", clase: "bg-success-surface text-success-ink" },
  solo_notas: { texto: "● Solo notas de Gemini", clase: "bg-surface-muted text-fg-secondary" },
  nada: { texto: "○ Sin nada", clase: "bg-warn-surface text-warn-ink" },
  sin_empresa: { texto: "Sin empresa", clase: "border border-dashed border-line bg-surface-muted text-fg-muted" },
};

export function ChipDeEstado({ estado }: { estado: EstadoDeLaReunion }) {
  const c = CHIP[estado];
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-[14px]", c.clase)}>{c.texto}</span>;
}

function Lectura({ leida }: { leida: boolean | null }) {
  if (leida === null) return <span className="text-xs text-fg-muted">—</span>;
  return leida ? <span className="text-xs font-semibold text-success-ink">✓ Leída</span> : <span className="text-xs font-semibold text-fg-muted">○ Sin leer</span>;
}

/* ── Lista de reuniones (adentro de una fila, o «Tus reuniones») ───────────────────────── */

const COLUMNAS_DE_REUNION = "grid grid-cols-[64px_minmax(180px,1.4fr)_minmax(140px,1fr)_176px_84px_minmax(220px,1.6fr)] gap-3";

export function ListaDeReuniones({ reuniones, columna = "empresa", total }: { reuniones: readonly ReunionVista[]; columna?: "empresa" | "organizo"; total?: number }) {
  if (!reuniones.length) return <p className="px-4 py-3 text-xs text-fg-muted">No hay reuniones para mostrar.</p>;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[960px]">
        <div className={cn(COLUMNAS_DE_REUNION, "border-b border-line px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted")}>
          <span>Fecha</span>
          <span>Reunión</span>
          <span>{columna === "empresa" ? "Empresa" : "Organizó"}</span>
          <span>Estado</span>
          <span>Lectura</span>
          <span>Si no dejó texto, por qué</span>
        </div>
        {reuniones.map((m) => (
          <div key={m.id} className={cn(COLUMNAS_DE_REUNION, "items-center border-t border-line px-4 py-2 text-[13px] leading-[19px] first:border-t-0")}>
            <span className="text-xs text-fg-muted">{fechaCorta(m.fecha)}</span>
            <Link href={`/sessions/${m.id}`} className="truncate font-semibold text-fg hover:text-brand">
              {m.titulo}
            </Link>
            <span className={columna === "empresa" && !m.empresa ? "text-fg-muted" : "text-fg"}>{(columna === "empresa" ? m.empresa : m.organizo) ?? "—"}</span>
            <span>
              <ChipDeEstado estado={m.estado} />
            </span>
            <Lectura leida={m.leida} />
            <span className="text-xs leading-4 text-fg-secondary">{m.motivo ?? ""}</span>
          </div>
        ))}
        {total !== undefined && total > reuniones.length && (
          <p className="border-t border-line px-4 py-2.5 text-xs text-fg-muted">
            Mostrando las {reuniones.length} más recientes de {miles(total)}.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Por persona y por empresa ─────────────────────────────────────────────────────────── */

const COLUMNAS_DE_FILA = "grid grid-cols-[minmax(220px,1.6fr)_84px_112px_92px_80px_92px_92px_minmax(180px,1.3fr)_20px] gap-3";

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function TablaDeGrupos({
  titulo,
  ayuda,
  filas,
  tipo,
}: {
  titulo: string;
  ayuda: string;
  filas: readonly FilaDeLaSalud[];
  tipo: "persona" | "empresa";
}) {
  return (
    <section aria-label={titulo} className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
          <p className="text-xs text-fg-muted">{ayuda}</p>
        </div>
        <Leyenda />
      </div>
      {filas.length === 0 ? (
        <div className="border-t border-line p-6">
          <EmptyState title="No hay reuniones con gente de fuera en este periodo" description="Prueba con un periodo más largo." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[1040px]">
            <div className={cn(COLUMNAS_DE_FILA, "border-t border-line bg-surface-muted px-5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted")}>
              <span>{tipo === "persona" ? "Persona" : "Empresa"}</span>
              <span className="text-right">Reuniones</span>
              <span className="text-right">Transcripción</span>
              <span className="text-right">Solo notas</span>
              <span className="text-right">Sin nada</span>
              <span className="text-right">{tipo === "persona" ? "Sin empresa" : ""}</span>
              <span className="text-right">Leídas</span>
              <span>Dejaron texto</span>
              <span />
            </div>
            {filas.map((f) => (
              <details key={f.clave} className="group border-t border-line">
                <summary className={cn(COLUMNAS_DE_FILA, "cursor-pointer list-none items-center px-5 py-2.5 hover:bg-surface-hover group-open:bg-surface-muted [&::-webkit-details-marker]:hidden")}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    {tipo === "persona" && (
                      <span aria-hidden className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-dark">
                        {iniciales(f.nombre)}
                      </span>
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-semibold text-fg">{f.nombre}</span>
                      <span className="truncate text-xs text-fg-muted">{f.detalle ?? (tipo === "empresa" ? "Sin encargada" : "")}</span>
                    </span>
                  </span>
                  <span className="text-right text-[13px] font-semibold text-fg">{miles(f.total)}</span>
                  <span className="text-right text-[13px] text-fg">{miles(f.transcripcion)}</span>
                  <span className="text-right text-[13px] text-fg">{miles(f.soloNotas)}</span>
                  <span className="text-right text-[13px] text-fg">{miles(f.sinNada)}</span>
                  <span className="text-right text-[13px] text-fg">{tipo === "persona" ? miles(f.sinEmpresa) : ""}</span>
                  <span className="text-right text-[13px] text-fg-secondary">
                    {miles(f.leidas)} de {miles(f.conTexto)}
                  </span>
                  <Barra f={f} />
                  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-fg-muted transition-transform group-open:rotate-90">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </summary>
                <div className="bg-surface-muted px-5 pb-4 pt-1 sm:pl-14">
                  <div className="overflow-hidden rounded-xl border border-line bg-surface">
                    <ListaDeReuniones reuniones={f.reuniones} columna={tipo === "persona" ? "empresa" : "organizo"} total={f.total} />
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Leyenda() {
  return (
    <div className="flex flex-wrap gap-3.5 text-xs text-fg-secondary">
      {(
        [
          ["transcripcion", "Con transcripción"],
          ["solo_notas", "Solo notas de Gemini"],
          ["nada", "Sin nada"],
        ] as const
      ).map(([k, t]) => (
        <span key={k} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("h-2.5 w-2.5 rounded-[3px]", PUNTO[k])} />
          {t}
        </span>
      ))}
    </div>
  );
}

function Barra({ f }: { f: FilaDeLaSalud }) {
  const de = f.conEmpresa;
  return (
    <span className="flex items-center gap-2.5">
      <span aria-hidden className="flex h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <span className={PUNTO.transcripcion} style={{ width: `${pct(f.transcripcion, de)}%` }} />
        <span className={PUNTO.solo_notas} style={{ width: `${pct(f.soloNotas, de)}%` }} />
        <span className={PUNTO.nada} style={{ width: `${pct(f.sinNada, de)}%` }} />
      </span>
      <span className="w-10 flex-none text-right text-[13px] font-semibold text-fg">{f.porcentaje === null ? "—" : `${f.porcentaje} %`}</span>
    </span>
  );
}

/* ── Sin texto: por qué ────────────────────────────────────────────────────────────────── */

const DEL_DUENO: Record<DuenoDelArreglo, { nombre: string; rotulo: string; ayuda: string }> = {
  google_workspace: {
    nombre: "Google Workspace",
    rotulo: "Lo arregla",
    ayuda: "Se arregla en Meet: alguien del equipo activa «Tomar notas» y «Transcribir» al empezar la reunión.",
  },
  nexus: { nombre: "Nexus", rotulo: "Lo arregla", ayuda: "Nexus lo reintenta solo. Si una reunión se queda aquí más de un día, avísale al equipo de Nexus." },
  persona: {
    nombre: "La persona",
    rotulo: "Lo arregla",
    ayuda: "Nadie del equipo estaba en la invitación, así que Nexus no puede pedirle el texto a Google. Para la próxima: invita a alguien del equipo.",
  },
  nada: { nombre: "Nada que hacer todavía", rotulo: "Se resuelve solo", ayuda: "Son reuniones recientes o canceladas. No hace falta hacer nada: vuelve a mirar en dos días." },
};

export function MotivosSinTexto({ grupos, total }: { grupos: readonly GrupoDeMotivos[]; total: number }) {
  if (!grupos.length) {
    return <EmptyState title="Todas las reuniones con empresa dejaron texto" description="En este periodo no hay ninguna sin transcripción ni notas." />;
  }
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-fg-secondary">
        Las <strong className="font-semibold text-fg">{miles(total)} reuniones sin nada</strong>, agrupadas por quién puede arreglarlo. Abre un motivo para ver sus reuniones.
      </p>
      {grupos.map((g) => {
        const d = DEL_DUENO[g.dueno];
        const mayor = Math.max(...g.motivos.map((m) => m.cuantas), 1);
        return (
          <section key={g.dueno} aria-label={d.nombre} className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
              <div className="min-w-0 flex-[1_1_420px] space-y-1">
                <Rotulo>{d.rotulo}</Rotulo>
                <h2 className="text-sm font-semibold text-fg">{d.nombre}</h2>
                <p className="text-xs text-fg-muted">{d.ayuda}</p>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[26px] font-light leading-8 text-fg">{miles(g.cuantas)}</span>
                <span className="text-xs text-fg-muted">{pct(g.cuantas, total)} % de las sin nada</span>
              </div>
            </div>
            {g.motivos.map((m) => (
              <details key={m.motivo} className="group border-t border-line">
                <summary className="grid cursor-pointer list-none grid-cols-[minmax(260px,1fr)_minmax(120px,280px)_48px_20px] items-center gap-4 px-5 py-3 hover:bg-surface-hover group-open:bg-surface-muted [&::-webkit-details-marker]:hidden">
                  <span className="text-[13px] font-semibold text-fg">{m.texto}</span>
                  <span aria-hidden className="flex h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <span className="rounded-full bg-warning" style={{ width: `${pct(m.cuantas, mayor)}%` }} />
                  </span>
                  <span className="text-right text-[13px] font-semibold text-fg">{miles(m.cuantas)}</span>
                  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-fg-muted transition-transform group-open:rotate-90">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </summary>
                <div className="bg-surface-muted px-5 pb-4 pt-1">
                  <div className="overflow-hidden rounded-xl border border-line bg-surface">
                    <ReunionesDelMotivo reuniones={m.reuniones} total={m.cuantas} />
                  </div>
                </div>
              </details>
            ))}
          </section>
        );
      })}
    </div>
  );
}

const COLUMNAS_DEL_MOTIVO = "grid grid-cols-[64px_minmax(200px,1.4fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(200px,1.3fr)] gap-3";

function ReunionesDelMotivo({ reuniones, total }: { reuniones: readonly ReunionVista[]; total: number }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[880px]">
        <div className={cn(COLUMNAS_DEL_MOTIVO, "border-b border-line px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted")}>
          <span>Fecha</span>
          <span>Reunión</span>
          <span>Empresa</span>
          <span>Organizó</span>
          <span>Del equipo estuvieron</span>
        </div>
        {reuniones.map((r) => (
          <div key={r.id} className={cn(COLUMNAS_DEL_MOTIVO, "items-center border-t border-line px-4 py-2 text-[13px] first:border-t-0")}>
            <span className="text-xs text-fg-muted">{fechaCorta(r.fecha)}</span>
            <Link href={`/sessions/${r.id}`} className="truncate font-semibold text-fg hover:text-brand">
              {r.titulo}
            </Link>
            <span className="text-fg">{r.empresa ?? "—"}</span>
            <span className="text-fg-secondary">{r.organizo ?? "—"}</span>
            <span className="text-xs text-fg-secondary">{r.delEquipo.join(", ") || "—"}</span>
          </div>
        ))}
        {total > reuniones.length && <p className="border-t border-line px-4 py-2.5 text-xs text-fg-muted">Mostrando las {reuniones.length} más recientes de {miles(total)}.</p>}
      </div>
    </div>
  );
}

/* ── Sin empresa ───────────────────────────────────────────────────────────────────────── */

const COLUMNAS_SIN_EMPRESA = "grid grid-cols-[150px_64px_minmax(200px,1.4fr)_minmax(200px,1.2fr)_minmax(150px,1fr)_176px] gap-3";

export function ReunionesSinEmpresa({ reuniones }: { reuniones: readonly SinEmpresaVista[] }) {
  return (
    <div className="space-y-4">
      <section aria-label="Sin empresa" className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-fg">Tienen texto, pero Nexus no sabe de qué empresa son</h2>
            <p className="text-xs text-fg-muted">Reuniones con invitados de fuera que esperan que alguien decida. Primero, las que llevan más tiempo esperando.</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-fg-secondary">
            <span aria-hidden className="h-2 w-2 rounded-full bg-warning" />
            Más de {HORAS_SIN_EMPRESA} horas: Nexus lo vigila todos los días
          </span>
        </div>
        {reuniones.length === 0 ? (
          <div className="border-t border-line p-6">
            <EmptyState title="Ninguna reunión con texto espera empresa" description="Todas las reuniones con gente de fuera de este periodo ya saben de qué empresa son." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1060px]">
              <div className={cn(COLUMNAS_SIN_EMPRESA, "border-t border-line bg-surface-muted px-5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted")}>
                <span>Esperando</span>
                <span>Fecha</span>
                <span>Reunión</span>
                <span>Invitados de fuera</span>
                <span>Organizó</span>
                <span>Texto</span>
              </div>
              {reuniones.map((r) => (
                <div key={r.id} className={cn(COLUMNAS_SIN_EMPRESA, "items-center border-t border-line px-5 py-2.5 text-[13px]")}>
                  <span>
                    {r.vencida ? (
                      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-warn-surface px-2.5 py-1 text-[11px] font-semibold text-warn-ink">● {cuantoEspera(r.horasEsperando)}</span>
                    ) : (
                      <span className="text-xs text-fg-muted">{cuantoEspera(r.horasEsperando)}</span>
                    )}
                  </span>
                  <span className="text-xs text-fg-muted">{fechaCorta(r.fecha)}</span>
                  <Link href={`/sessions/${r.id}`} className="truncate font-semibold text-fg hover:text-brand">
                    {r.titulo}
                  </Link>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-fg">
                      {r.deFuera.primero}
                      {r.deFuera.cuantos > 1 ? ` y ${r.deFuera.cuantos - 1} más` : ""}
                    </span>
                    <span className="truncate text-xs text-fg-muted">
                      {r.deFuera.cuantos === 1 ? "1 persona" : `${r.deFuera.cuantos} personas`} · {r.deFuera.dominios.map((d) => `@${d}`).join(", ")}
                    </span>
                  </span>
                  <span className="text-fg-secondary">{r.organizo ?? "—"}</span>
                  <span>
                    <ChipDeEstado estado={r.texto} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-line bg-surface-muted px-3.5 py-3 text-[13px] text-fg-muted">
        <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-fg-secondary">Pronto</span>
        <span>Nexus te propondrá la empresa de cada reunión para que la confirmes con un clic. Por ahora, se decide desde la página de la reunión.</span>
      </div>
    </div>
  );
}
