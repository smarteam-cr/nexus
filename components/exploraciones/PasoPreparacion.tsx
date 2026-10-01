"use client";

/**
 * PasoPreparacion — antes de la primera reunión, armado solo con lo que hay en HubSpot.
 *
 * La industria (la edición de la escala) y el perfil de negocio se ELIGEN SOLOS (pedido de Elías,
 * 2026-10-01): por la industria de HubSpot o, si no alcanza, por el agente que lee todo lo de la
 * empresa; con la edición va su perfil habitual. Se ve quién los eligió y por qué, y se cambian con
 * un clic. Después: las áreas en juego, lo que ya se sabe, las hipótesis y qué explorar a fondo.
 */
import { useState } from "react";
import { Badge, Button, Input, Segmentado, Select } from "@/components/ui";
import { estaDebajo } from "@/lib/escala/chequeo";
import { CIERRES, DESPUES, type Cierre, type Despues } from "@/lib/escala/documento/tipos";
import { industriaDelVendedor, normalizarTexto } from "@/lib/exploraciones/contenido";
import { industriaLegible } from "@/lib/exploraciones/industria";
import { Casilla } from "./Casilla";
import { useLienzo } from "./contexto";
import PanelDelAgente from "./PanelDelAgente";
import { Propuestas } from "./Propuestas";

/** Hasta cuántas dimensiones por área se profundiza: lo que cabe en la segunda reunión. */
export const MAX_A_EXPLORAR_POR_AREA = 4;

const NOMBRE_DEL_CIERRE: Record<Cierre, string> = { "con equipo": "Con equipo", transaccional: "Transaccional", mixta: "Mixta" };
const NOMBRE_DEL_DESPUES: Record<Despues, string> = { única: "Relación única", recompra: "Recompra", continua: "Relación continua" };

function Tarjeta({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
        {ayuda && <p className="text-xs text-fg-muted">{ayuda}</p>}
      </div>
      {children}
    </section>
  );
}

function IndustriaYPerfil() {
  const { exp, escala, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const e = exp.estado;
  const elegida = e.contenido.edicionElegida;
  const pendientes = pendientesPara((d) => d.tipo === "edicion" || d.tipo === "perfil");
  const edicion = escala.ediciones.find((x) => x.slug === e.edicion) ?? null;
  const habitual = edicion?.perfilHabitual ?? null;
  const esElHabitual = !!habitual && habitual.cierre === e.perfilCierre && habitual.despues === e.perfilDespues;
  const definicion = (p: typeof escala.perfil.cierre, nombre: string) =>
    p?.opciones.find((o) => normalizarTexto(o.nombre) === normalizarTexto(nombre))?.definicion;
  const opcionesCierre = CIERRES.map((c) => ({ clave: c, etiqueta: NOMBRE_DEL_CIERRE[c], title: definicion(escala.perfil.cierre, c) }));
  const opcionesDespues = DESPUES.map((d) => ({ clave: d, etiqueta: NOMBRE_DEL_DESPUES[d], title: definicion(escala.perfil.despues, d) }));

  const quien =
    industriaDelVendedor(e)
      ? { insignia: "La elegiste tú", texto: "El agente ya no la cambia." }
      : elegida?.por === "agente"
        ? { insignia: "Automática", texto: elegida.razon ?? "La eligió el agente con lo que hay en HubSpot." }
        : elegida?.por === "industria"
          ? { insignia: "Automática", texto: elegida.razon ?? "Por la industria de la empresa en HubSpot." }
          : { insignia: null, texto: "El agente la elige al preparar, con lo que hay de la empresa en HubSpot." };

  return (
    <Tarjeta
      titulo="Industria y perfil de negocio"
      ayuda="Con qué edición de la escala se mide y cómo vende la empresa. Se eligen solos con lo que hay en HubSpot; cámbialos si no calzan."
    >
      <div className="grid gap-4 md:grid-cols-[1fr_1.3fr]">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-fg-secondary" htmlFor="exploracion-edicion">
            Industria (edición de la escala)
          </label>
          <Select
            id="exploracion-edicion"
            value={e.edicion ?? ""}
            disabled={!puedeEditar || guardando}
            onChange={(ev) => void cambiar([{ op: "edicion", edicion: ev.target.value || null }], { refrescar: true })}
          >
            <option value="">Escala general</option>
            {escala.ediciones.map((ed) => (
              <option key={ed.slug} value={ed.slug}>
                {ed.nombre}
              </option>
            ))}
          </Select>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-secondary">
            {quien.insignia && (
              <Badge size="xs" variant={industriaDelVendedor(e) ? "default" : "info"}>
                {quien.insignia}
              </Badge>
            )}
            <span>{quien.texto}</span>
          </p>
          {edicion?.descripcion && <p className="text-xs text-fg-muted">{edicion.descripcion}</p>}
          {exp.empresa.industria && <p className="text-2xs text-fg-muted">En HubSpot: {industriaLegible(exp.empresa.industria)}</p>}
        </div>
        <div className="space-y-2">
          <span className="block text-xs font-medium text-fg-secondary">Cómo se cierra la venta y qué pasa después</span>
          <div className="flex flex-wrap gap-2">
            <Segmentado<Cierre>
              etiqueta="Cómo se cierra la venta"
              opciones={opcionesCierre}
              valor={e.perfilCierre}
              deshabilitado={!puedeEditar || guardando}
              onCambio={(c) => void cambiar([{ op: "perfil", cierre: c, despues: e.perfilDespues }], { refrescar: true })}
            />
            <Segmentado<Despues>
              etiqueta="Qué pasa después de la venta"
              opciones={opcionesDespues}
              valor={e.perfilDespues}
              deshabilitado={!puedeEditar || guardando}
              onCambio={(d) => void cambiar([{ op: "perfil", cierre: e.perfilCierre, despues: d }], { refrescar: true })}
            />
          </div>
          {edicion && habitual && (
            <p className="text-xs text-fg-muted">
              {esElHabitual
                ? `Es el perfil habitual de «${edicion.nombre}» en la escala.`
                : `El habitual de «${edicion.nombre}» es ${NOMBRE_DEL_CIERRE[habitual.cierre].toLowerCase()} · ${NOMBRE_DEL_DESPUES[habitual.despues].toLowerCase()}.`}
            </p>
          )}
        </div>
      </div>
      <Propuestas items={pendientes} />
    </Tarjeta>
  );
}

function AreasEnJuego() {
  const { exp, escala, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const e = exp.estado;
  const pendientes = pendientesPara((d) => d.tipo === "area");
  const [razones, setRazones] = useState<Record<string, string>>(e.contenido.razonesDeAreas);
  /* Si las razones cambian por otro lado (usar lo propuesto), los campos las siguen. */
  const [razonesVistas, setRazonesVistas] = useState(e.contenido.razonesDeAreas);
  if (razonesVistas !== e.contenido.razonesDeAreas) {
    setRazonesVistas(e.contenido.razonesDeAreas);
    setRazones(e.contenido.razonesDeAreas);
  }

  const alternar = (id: string) => {
    const areas = e.areas.includes(id) ? e.areas.filter((a) => a !== id) : [...e.areas, id];
    void cambiar([{ op: "areas", areas }]);
  };

  return (
    <Tarjeta
      titulo="Áreas en juego"
      ayuda="La del test, más las que el prospecto nombra o paga sin usar. El orden cuenta: a igual nivel, va primero la que se eligió primero."
    >
      <div className="flex flex-wrap gap-2">
        {escala.areas.map((a) => {
          const i = e.areas.indexOf(a.id);
          return (
            <Button
              key={a.id}
              size="sm"
              variant={i >= 0 ? "ghost" : "secondary"}
              aria-pressed={i >= 0}
              disabled={!puedeEditar || guardando}
              onClick={() => alternar(a.id)}
            >
              {i >= 0 && <span className="tabular-nums">{i + 1}.</span>} {a.nombre}
            </Button>
          );
        })}
      </div>
      {e.areas.length > 0 && (
        <div className="space-y-2">
          {e.areas.map((id) => (
            <div key={id} className="grid items-center gap-2 sm:grid-cols-[10rem_1fr]">
              <span className="text-xs text-fg-secondary">Por qué {escala.areas.find((a) => a.id === id)?.nombre}</span>
              <Input
                value={razones[id] ?? ""}
                disabled={!puedeEditar}
                placeholder="Lo que dijo o lo que paga sin usar"
                onChange={(ev) => setRazones((r) => ({ ...r, [id]: ev.target.value }))}
                onBlur={() => {
                  if ((razones[id] ?? "") !== (e.contenido.razonesDeAreas[id] ?? "")) {
                    void cambiar([{ op: "areas", areas: e.areas, razones: { [id]: (razones[id] ?? "").trim() } }]);
                  }
                }}
              />
            </div>
          ))}
        </div>
      )}
      <Propuestas items={pendientes} />
    </Tarjeta>
  );
}

/**
 * Qué explorar a fondo en la segunda reunión: una lista para marcar, con la razón de cada una dicha
 * en llano (lo que sugirió el agente o dónde parece estar). Sin motivos que elegir: el agente los
 * sugiere y el vendedor marca o desmarca.
 */
function QueExplorarAFondo() {
  const { exp, escala, mapa, cambiar, puedeEditar, guardando, pendientesPara, nombreDeNivel } = useLienzo();
  const e = exp.estado;
  const sugeridas = pendientesPara((d) => d.tipo === "aExplorar");
  if (e.areas.length === 0) return null;

  return (
    <Tarjeta
      titulo="Qué explorar a fondo"
      ayuda={`Las dimensiones en las que vale la pena profundizar en la segunda reunión, con el portal abierto: las que parecen estar debajo de ${nombreDeNivel("F")}, las que tocan una meta del cliente o dejan ver un riesgo. Hasta ${MAX_A_EXPLORAR_POR_AREA} por área; el resto lo verifica el CSE.`}
    >
      {escala.areas
        .filter((a) => e.areas.includes(a.id))
        .map((area) => {
          const elegidas = area.dimensiones.filter((d) => d.id in e.contenido.aExplorar).length;
          return (
            <div key={area.id} className="space-y-2">
              <p className="flex items-center gap-2 text-xs font-semibold text-fg-secondary">
                {area.nombre}
                <Badge size="xs" variant={elegidas > MAX_A_EXPLORAR_POR_AREA ? "warning" : "default"}>
                  {elegidas} de {MAX_A_EXPLORAR_POR_AREA}
                </Badge>
              </p>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {area.dimensiones
                  .filter((d) => d.aplica)
                  .map((d) => {
                    const marcada = e.contenido.aExplorar[d.id];
                    const sugerida = sugeridas.find((it) => it.destino.tipo === "aExplorar" && it.destino.dimensionId === d.id);
                    const p = mapa.posiciones[d.id];
                    const debajo = !!p && estaDebajo(p.nivel, "F");
                    const razon =
                      marcada?.razon ??
                      sugerida?.razon ??
                      (p ? `Parece estar en ${nombreDeNivel(p.nivel)}${p.clase === "hipotesis" ? " (hipótesis)" : ""}.` : "Todavía sin dato.");
                    const alternar = () => {
                      if (marcada) return void cambiar([{ op: "aExplorar", dimensionId: d.id, valor: null }]);
                      if (sugerida) return void cambiar([{ op: "usar", itemId: sugerida.id, valor: sugerida.valor }]);
                      void cambiar([{ op: "aExplorar", dimensionId: d.id, valor: { motivo: debajo ? "indicio" : "otro", razon: razon.slice(0, 300) } }]);
                    };
                    return (
                      <li key={d.id} className="flex items-start gap-3 px-3 py-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={!!marcada}
                          disabled={!puedeEditar || guardando}
                          onChange={alternar}
                          aria-label={`Explorar ${d.nombre} a fondo`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
                            {d.nombre}
                            {sugerida && !marcada && (
                              <Badge size="xs" variant="info">
                                Sugerida por el agente
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-fg-muted">{razon}</p>
                        </div>
                        {sugerida && !marcada && puedeEditar && (
                          <button
                            type="button"
                            className="flex-shrink-0 text-xs text-fg-muted hover:text-fg"
                            disabled={guardando}
                            onClick={() => void cambiar([{ op: "descartar", itemIds: [sugerida.id] }])}
                          >
                            Descartar
                          </button>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </div>
          );
        })}
    </Tarjeta>
  );
}

export default function PasoPreparacion() {
  return (
    <div className="space-y-4">
      <PanelDelAgente />
      <IndustriaYPerfil />
      <AreasEnJuego />
      <div className="grid gap-4 lg:grid-cols-2">
        <Casilla clave="contexto" />
        <Casilla clave="hubspotActual" />
      </div>
      <Casilla clave="hipotesis" />
      <QueExplorarAFondo />
    </div>
  );
}
