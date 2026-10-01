"use client";

/**
 * NivelDelArea — el chequeo de un área: el nivel estimado de cada dimensión y lo que sale de ahí.
 *
 * El nivel se elige por MEJOR AJUSTE, mirando la descripción de cada nivel (está en el tooltip de
 * cada opción). Nexus calcula el resto como lo dice la especificación del chequeo: la capa en su
 * dimensión más débil, el área en su capa más baja, el puntaje a mitad de tramo y qué va primero.
 * Todo queda «estimado»: lo verifica el CSE en su diagnóstico.
 */
import { useState } from "react";
import { Badge, Button, Input, Segmentado, Select } from "@/components/ui";
import { PUNTO_DE_NIVEL } from "@/components/escala/niveles";
import type { AreaDelChequeo, Recomendacion } from "@/lib/escala/chequeo";
import { estaDebajo } from "@/lib/escala/chequeo";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import { ETIQUETA_DE_LA_FUENTE, FUENTES_DEL_NIVEL, type EstimadoGuardado, type FuenteDelNivel } from "@/lib/exploraciones/contenido";
import type { DimensionDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import { cn } from "@/lib/cn";
import { useLienzo } from "./contexto";
import { Propuestas } from "./Propuestas";

const LETRAS: Letra[] = ["D", "I", "F", "E", "O"];

export function NivelChip({ nivel, puntaje, estimado = true }: { nivel: Letra | null; puntaje?: number | null; estimado?: boolean }) {
  const { nombreDeNivel } = useLienzo();
  if (!nivel) return <span className="text-xs text-fg-muted">Sin estimar</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-fg">
      <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[nivel])} aria-hidden="true" />
      {nombreDeNivel(nivel)}
      {puntaje != null && <span className="tabular-nums text-fg-muted">{puntaje}</span>}
      {estimado && <span className="text-2xs uppercase tracking-wide text-fg-muted">estimado</span>}
    </span>
  );
}

function FilaDeDimension({ d, enElArea }: { d: DimensionDelLienzo; enElArea: AreaDelChequeo }) {
  const { exp, cambiar, puedeEditar, guardando, nombreDeNivel, pendientesPara } = useLienzo();
  const estimado = exp.estado.contenido.chequeo[d.id];
  const calculada = enElArea.dimensiones.find((x) => x.id === d.id);
  const [abierta, setAbierta] = useState(false);
  const [evidencia, setEvidencia] = useState(estimado?.evidencia ?? "");
  /* Si la evidencia cambia por otro lado (usar lo propuesto, otra persona), el campo la sigue. */
  const [evidenciaVista, setEvidenciaVista] = useState(estimado?.evidencia);
  if (evidenciaVista !== estimado?.evidencia) {
    setEvidenciaVista(estimado?.evidencia);
    setEvidencia(estimado?.evidencia ?? "");
  }
  const pendientes = pendientesPara((x) => x.tipo === "nivel" && x.dimensionId === d.id);
  const aExplorar = d.id in exp.estado.contenido.aExplorar;

  const guardar = (cambio: Partial<EstimadoGuardado> & { nivel: Letra }) =>
    cambiar([
      {
        op: "nivel",
        dimensionId: d.id,
        estimado: {
          fuente: estimado?.fuente ?? "reunion",
          ...(estimado?.evidencia ? { evidencia: estimado.evidencia } : {}),
          ...(estimado?.riesgo ? { riesgo: true } : {}),
          ...cambio,
          // «No sé» solo vale con el nivel más bajo: si el nivel cambia a mano, deja de serlo.
          noSabe: cambio.noSabe ?? (cambio.nivel === "D" ? estimado?.noSabe : undefined),
        },
      },
    ]);

  const opciones = LETRAS.map((l) => ({
    clave: l,
    etiqueta: nombreDeNivel(l),
    title: d.niveles.find((n) => n.letra === l)?.descripcion,
  }));
  const debajoDeFuncional = !!calculada?.nivel && estaDebajo(calculada.nivel, "F");
  const funcional = d.niveles.find((n) => n.letra === "F");

  if (!d.aplica) {
    return (
      <li className="flex items-center justify-between gap-3 px-3 py-2.5 opacity-70">
        <span className="text-sm text-fg-secondary">{d.nombre}</span>
        <span className="text-xs text-fg-muted">No aplica a este perfil de negocio</span>
      </li>
    );
  }

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
            {d.nombre}
            {aExplorar && (
              <Badge variant="primary" size="xs">
                A explorar
              </Badge>
            )}
            {estimado?.noSabe && (
              <Badge variant="warning" size="xs">
                «No sé»
              </Badge>
            )}
            {calculada?.topadaPorRiesgo && (
              <Badge variant="warning" size="xs" title="Una dimensión con un riesgo a la vista no se estima por encima de Funcional.">
                Topada por un riesgo
              </Badge>
            )}
          </p>
          <p className="text-xs text-fg-muted">{d.pregunta}</p>
        </div>
        <Segmentado
          etiqueta={`Nivel de ${d.nombre}`}
          opciones={opciones}
          valor={estimado?.nivel ?? null}
          deshabilitado={!puedeEditar || guardando}
          onCambio={(nivel) => void guardar({ nivel, noSabe: false })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
        {estimado && <span>Fuente: {ETIQUETA_DE_LA_FUENTE[estimado.fuente]}</span>}
        {estimado?.evidencia && <span className="italic">«{estimado.evidencia}»</span>}
        <button type="button" className="text-brand-light hover:underline" onClick={() => setAbierta((v) => !v)}>
          {abierta ? "Menos" : "Detalle"}
        </button>
      </div>

      {abierta && (
        <div className="space-y-3 rounded-lg border border-line bg-surface-muted p-3">
          {puedeEditar && (
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <Select
                aria-label="De dónde salió el nivel"
                value={estimado?.fuente ?? "reunion"}
                disabled={!estimado}
                onChange={(e) => estimado && void guardar({ nivel: estimado.nivel, fuente: e.target.value as FuenteDelNivel })}
              >
                {FUENTES_DEL_NIVEL.map((f) => (
                  <option key={f} value={f}>
                    {ETIQUETA_DE_LA_FUENTE[f]}
                  </option>
                ))}
              </Select>
              <Input
                value={evidencia}
                disabled={!estimado}
                placeholder={estimado ? "La frase del cliente que lo respalda" : "Primero elige un nivel"}
                aria-label="Evidencia"
                onChange={(e) => setEvidencia(e.target.value)}
                onBlur={() => {
                  if (estimado && evidencia.trim() !== (estimado.evidencia ?? "")) void guardar({ nivel: estimado.nivel, evidencia: evidencia.trim() || undefined });
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                title="La escala cuenta «no sé» como el nivel más bajo."
                onClick={() => void guardar({ nivel: "D", noSabe: true })}
              >
                No sabe
              </Button>
            </div>
          )}
          {d.riesgos.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-fg-secondary">Riesgos de esta dimensión</p>
              <ul className="space-y-1 text-xs text-fg-muted">
                {d.riesgos.map((r) => (
                  <li key={r.id}>{r.mensaje ?? r.texto}</li>
                ))}
              </ul>
              {puedeEditar && estimado && (
                <Button size="xs" variant="secondary" onClick={() => void guardar({ nivel: estimado.nivel, riesgo: !estimado.riesgo })}>
                  {estimado.riesgo ? "Quitar el riesgo a la vista" : "Una respuesta dejó ver este riesgo"}
                </Button>
              )}
            </div>
          )}
          {debajoDeFuncional && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-fg-secondary">Lo que le cuesta quedarse así</p>
              <p className="text-xs text-fg-muted">{d.costoDeQuedarse}</p>
            </div>
          )}
          {debajoDeFuncional && funcional?.resultado && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-fg-secondary">Lo que ganaría en Funcional</p>
              <p className="text-xs text-fg-muted">{funcional.resultado}</p>
            </div>
          )}
        </div>
      )}

      <Propuestas items={pendientes} compacto />
    </li>
  );
}

export function NivelDelArea({ areaId }: { areaId: string }) {
  const { escala, chequeo, nombreDeNivel } = useLienzo();
  const area = escala.areas.find((a) => a.id === areaId);
  const calculo = chequeo.areas.find((a) => a.id === areaId);
  if (!area || !calculo) return null;
  const nombreDeCapa = (c: ClaveDeCapa) => escala.capas.find((x) => x.clave === c)?.nombre ?? c;

  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-fg">{area.nombre}</h3>
          {calculo.faltan.length > 0 ? (
            <p className="text-xs text-fg-muted">
              {calculo.faltan.length === 1 ? "Falta 1 dimensión" : `Faltan ${calculo.faltan.length} dimensiones`}: sin las ocho no se sabe cuál es la más débil.
            </p>
          ) : (
            <p className="text-xs text-fg-muted">
              {(["base", "produccion"] as ClaveDeCapa[])
                .map((c) => `${nombreDeCapa(c)}: ${calculo.capas[c].nivel ? nombreDeNivel(calculo.capas[c].nivel as Letra) : "—"}`)
                .join(" · ")}
            </p>
          )}
        </div>
        <NivelChip nivel={calculo.nivel} puntaje={calculo.puntaje} />
      </header>
      {(["base", "produccion"] as ClaveDeCapa[]).map((capa) => (
        <div key={capa}>
          <p className="border-b border-line bg-surface-muted px-4 py-1.5 text-2xs font-semibold uppercase tracking-wide text-fg-muted">
            {nombreDeCapa(capa)}
          </p>
          <ul className="divide-y divide-line">
            {area.dimensiones
              .filter((d) => d.capa === capa)
              .map((d) => (
                <FilaDeDimension key={d.id} d={d} enElArea={calculo} />
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

const RAZON_DEL_AREA: Record<Exclude<Extract<Recomendacion, { tipo: "trabajar" }>["razon"]["area"], "unica">, string> = {
  "la-mas-baja": "es el área más baja de las que se miraron",
  "empate-la-primera": "empata con otra y es la que el prospecto eligió primero",
};

/** Qué va primero, con su razón: es lo que el prospecto se lleva de la primera reunión. */
export function QueVaPrimero() {
  const { escala, chequeo, nombreDeNivel } = useLienzo();
  const r = chequeo.recomendacion;
  if (!r) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-fg-muted">
        Cuando estén estimadas las ocho dimensiones de cada área en juego, aquí aparece qué va primero y por qué.
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
  const sinEstimar = chequeo.areas.filter((a) => a.nivel === null).map((a) => a.nombre);

  return (
    <div className="space-y-2 rounded-xl border border-brand/25 bg-brand/5 px-4 py-3">
      <p className="text-2xs font-semibold uppercase tracking-wide text-brand-light">Qué va primero</p>
      <p className="text-sm text-fg">
        <span className="font-semibold">{dim?.nombre}</span>
        {area && <span className="text-fg-secondary"> ({area.nombre})</span>}, para llevarla a {nombreDeNivel(r.objetivo)}.
      </p>
      <p className="text-xs text-fg-secondary">Por qué: {razones.join("; ")}.</p>
      {dim && estaDebajo(r.objetivo, "E") && <p className="text-xs text-fg-muted">Lo que le cuesta quedarse así: {dim.costoDeQuedarse}</p>}
      {resultado && <p className="text-xs text-fg-muted">Lo que ganaría: {resultado}</p>}
      {chequeo.parcial && (
        <p className="text-xs text-fg-muted">
          Con lo estimado hasta ahora: falta estimar {sinEstimar.join(" y ")}, y eso puede cambiar qué va primero.
        </p>
      )}
    </div>
  );
}
