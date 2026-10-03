"use client";

/**
 * QueVaPrimero — lo primero que hay que trabajar, con su razón, como lo dice la escala (paso 6 del
 * chequeo). Es lo que el prospecto se lleva de la primera reunión.
 *
 * Sale del MAPA (lo confirmado y, donde no hay, las hipótesis): en la primera reunión todavía no
 * hay evidencia de casi nada, y el plan se muestra igual. Si entra una hipótesis, se dice.
 */
import { PUNTO_DE_NIVEL } from "@/components/escala/niveles";
import type { Recomendacion } from "@/lib/escala/chequeo";
import { estaDebajo } from "@/lib/escala/chequeo";
import type { Letra } from "@/lib/escala/documento/tipos";
import { cn } from "@/lib/cn";
import { useLienzo } from "./contexto";

/** El nivel con su punto de color y su nombre (de la escala). */
export function NivelChip({ nivel, className }: { nivel: Letra | null; className?: string }) {
  const { nombreDeNivel } = useLienzo();
  if (!nivel) return <span className={cn("text-xs text-fg-muted", className)}>Sin dato</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-fg", className)}>
      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", PUNTO_DE_NIVEL[nivel])} aria-hidden="true" />
      {nombreDeNivel(nivel)}
    </span>
  );
}

const RAZON_DEL_AREA: Record<Exclude<Extract<Recomendacion, { tipo: "trabajar" }>["razon"]["area"], "unica">, string> = {
  "la-mas-baja": "es el área más baja de las que se miraron",
  "empate-la-primera": "empata con otra y es la que el prospecto eligió primero",
};

export function QueVaPrimero() {
  const { escala, mapa, nombreDeNivel } = useLienzo();
  const chequeo = mapa.chequeo;
  const r = chequeo.recomendacion;
  if (!r) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-fg-muted">
        Cuando cada área en juego tenga sus ocho dimensiones en el mapa (con evidencia o como hipótesis), aquí aparece qué va primero y por qué.
      </p>
    );
  }
  const area = escala.areas.find((a) => a.id === r.areaId);
  if (r.tipo === "sostener") {
    return (
      <div className="rounded-xl border border-success-line bg-success-surface px-4 py-3 text-sm text-success-ink">
        {area?.nombre} ya llegó a su objetivo: lo que toca es sostenerlo y volver a medir.
      </div>
    );
  }
  const dim = area?.dimensiones.find((d) => d.id === r.dimensionId);
  const capa = escala.capas.find((c) => c.clave === r.capa)?.nombre ?? r.capa;
  const razones = [
    r.razon.area !== "unica" ? `${area?.nombre} ${RAZON_DEL_AREA[r.razon.area]}` : null,
    r.razon.capa === "unica-con-pendientes"
      ? `${capa} es la única capa con algo debajo del objetivo`
      : r.razon.capa === "la-mas-baja"
        ? `${capa} es la capa más baja`
        : r.razon.capa === "empate-base"
          ? "las dos capas están parejas debajo de Funcional, y entonces va primero la base"
          : "las dos capas están parejas de Funcional para arriba, y entonces va primero la producción",
    r.razon.dimension === "la-mas-baja"
      ? `${dim?.nombre} es la dimensión más baja de esa capa`
      : r.razon.dimension === "empate-por-orden"
        ? `${dim?.nombre} empata con otras y es la que va antes en el orden de dependencias`
        : `${dim?.nombre} empata con otras (falta el perfil de negocio para saber el orden)`,
  ].filter(Boolean);
  const resultado = dim?.niveles.find((n) => n.letra === r.objetivo)?.resultado;
  const sinDatos = chequeo.areas.filter((a) => a.nivel === null).map((a) => a.nombre);
  // ¿Lo que decide el plan es una hipótesis? Las áreas que entran a la cuenta, dimensión por dimensión.
  const conHipotesis = chequeo.areas
    .filter((a) => a.nivel !== null)
    .some((a) => a.dimensiones.some((d) => d.aplica && mapa.posiciones[d.id]?.clase === "hipotesis"));

  return (
    <div className="space-y-2 rounded-xl border border-info-line bg-info-surface px-4 py-3">
      <p className="text-2xs font-semibold uppercase tracking-wide text-info-ink">Qué va primero</p>
      <p className="text-sm text-fg">
        <span className="font-semibold">{dim?.nombre}</span>
        {area && <span className="text-fg-secondary"> ({area.nombre})</span>}, para llevarla a {nombreDeNivel(r.objetivo)}.
      </p>
      <p className="text-xs text-fg-secondary">Por qué: {razones.join("; ")}.</p>
      {dim && estaDebajo(r.objetivo, "E") && <p className="text-xs text-fg-muted">Lo que le cuesta quedarse así: {dim.costoDeQuedarse}</p>}
      {resultado && <p className="text-xs text-fg-muted">Lo que ganaría: {resultado}</p>}
      {conHipotesis && <p className="text-xs text-fg-muted">Sale en parte de hipótesis: confírmalas en la reunión, porque pueden cambiar qué va primero.</p>}
      {chequeo.parcial && <p className="text-xs text-fg-muted">Falta ubicar {sinDatos.join(" y ")}, y eso también puede cambiar qué va primero.</p>}
    </div>
  );
}
