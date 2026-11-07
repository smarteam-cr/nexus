/**
 * components/casos-de-uso/FichaDeLaActividad.tsx — una actividad de la biblioteca leída de un vistazo (pedido de Elías
 * del 2026-11-05): etiquetas arriba (si es única o se repite y por qué, cómo se cobra en la venta, a qué
 * equipos se aplica, quién la hace) y adentro viñetas en vez de un párrafo: qué incluye, cómo se cuenta, qué no es, lo
 * que pide al cliente y su licencia. Solo presentación, sin JS.
 */
import { cn } from "@/lib/cn";
import {
  formatoHoras,
  oraciones,
  type ActividadDeLaBiblioteca,
  type ComoSeComparte,
  type FilaDelCaso,
  type ParteDelTiempo,
} from "@/lib/casos-de-uso/actividades";

export const SE_COBRA: Record<ComoSeComparte, string> = {
  venta: "Una vez en la venta",
  sobreQue: "Una vez si es sobre lo mismo",
  no: "En cada caso",
};

const ETIQUETA = "inline-flex items-center rounded-full border border-line px-1.5 py-px text-[11px] leading-4 text-fg-muted";
const ETIQUETA_CLIENTE = "inline-flex items-center rounded-full bg-brand-soft px-1.5 py-px text-[11px] font-medium leading-4 text-brand";

/** «Se repite · por sesión», «Única · por venta» o, en una mejora que va una vez, «Única». */
export function textoDeRepeticion(a: Pick<ActividadDeLaBiblioteca, "seRepite" | "unidad">): string {
  if (a.seRepite) return `Se repite · por ${a.unidad}`;
  return a.unidad === "mejora" ? "Única" : `Única · por ${a.unidad}`;
}

/** Las etiquetas de una actividad o de una fila (las de la fila salen de su actividad). */
export function EtiquetasDeLaActividad({
  a,
  className,
}: {
  a: Pick<ActividadDeLaBiblioteca, "seRepite" | "unidad" | "comparte" | "quien"> & Partial<Pick<ActividadDeLaBiblioteca, "equipos" | "esEstimacion">>;
  className?: string;
}) {
  const equipos = a.equipos ?? [];
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      <span className={ETIQUETA}>{textoDeRepeticion(a)}</span>
      <span className={ETIQUETA}>{SE_COBRA[a.comparte]}</span>
      {equipos.includes("Todos") ? (
        <span className={ETIQUETA}>Todos los equipos</span>
      ) : (
        equipos.map((e) => (
          <span key={e} className={ETIQUETA}>
            {e}
          </span>
        ))
      )}
      {!a.quien.startsWith("CSE") && <span className={ETIQUETA}>{a.quien}</span>}
      {a.esEstimacion && <span className={ETIQUETA}>Tiempo estimado</span>}
    </span>
  );
}

function Lista({ titulo, items }: { titulo: string; items: readonly string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-fg">{titulo}</span>
      <ul className="flex list-disc flex-col gap-0.5 pl-4 marker:text-fg-muted">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * De qué está hecho el tiempo: una línea por parte, con sus horas y si es con el cliente. Las variables dicen que un caso
 * puede cambiarles las veces; las de 0 veces son opcionales.
 */
export function RepartoDelTiempo({ partes, total }: { partes: readonly ParteDelTiempo[]; total: number }) {
  if (!partes.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-fg">Cómo se reparten las {formatoHoras(total)}</span>
      <ul className="flex flex-col gap-0.5">
        {partes.map((p) => (
          <li key={p.clave} className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="w-14 flex-none text-right tabular-nums text-fg">
              {p.veces > 1 ? `${p.veces} × ` : ""}
              {formatoHoras(p.horas)}
            </span>
            <span>{p.nombre}</span>
            <span className={p.conElCliente ? ETIQUETA_CLIENTE : ETIQUETA}>{p.conElCliente ? "con el cliente" : "interno"}</span>
            {p.veces === 0 && <span className="text-xs text-fg-muted">opcional</span>}
            {p.variable && p.veces > 0 && <span className="text-xs text-fg-muted">cada caso puede cambiar cuántas</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lo de adentro de una actividad de la biblioteca: el resumen y sus viñetas. */
export function InteriorDeLaActividad({ a }: { a: ActividadDeLaBiblioteca }) {
  return (
    <div className="flex flex-col gap-2.5 text-[13px] leading-5 text-fg-secondary">
      <p className="text-fg">{a.resumen}</p>
      <EtiquetasDeLaActividad a={a} />
      <RepartoDelTiempo partes={a.partes} total={a.horas} />
      <Lista titulo="Qué incluye" items={a.incluye} />
      <Lista titulo="Cómo se cuenta" items={a.reglas} />
      <Lista titulo="No es" items={a.noEs} />
      <Lista titulo="Pide al cliente" items={a.pideAlCliente} />
      {a.sobreQue.length > 0 && (
        <p className="text-xs text-fg-muted">
          <span className="font-medium text-fg">Sobre qué puede ser:</span> {a.sobreQue.map((s) => `«${s}»`).join(", ")}.
        </p>
      )}
      {a.licencia && (
        <p className="text-xs text-fg-muted">
          <span className="font-medium text-fg">Licencia:</span> {a.licencia}
        </p>
      )}
      {a.deja && (
        <p className="text-xs text-fg-muted">
          <span className="font-medium text-fg">Deja en Nexus:</span> {a.deja}.
        </p>
      )}
    </div>
  );
}

/** Un texto largo de una fila en viñetas, una por oración; si es una sola oración, va como párrafo. */
export function EnVinetas({ texto, className }: { texto: string; className?: string }) {
  const partes = oraciones(texto);
  if (partes.length <= 1) return <p className={className}>{texto}</p>;
  return (
    <ul className={cn("flex list-disc flex-col gap-0.5 pl-4 marker:text-fg-muted", className)}>
      {partes.map((p, i) => (
        <li key={i}>{p}</li>
      ))}
    </ul>
  );
}

/** Las etiquetas de una fila de un caso: si es única o se repite y cómo se cobra. Sin los equipos (el caso ya los dice). */
export function EtiquetasDeLaFila({ f }: { f: Pick<FilaDelCaso, "seRepite" | "unidad" | "comparte" | "quien"> }) {
  return <EtiquetasDeLaActividad a={f} />;
}
