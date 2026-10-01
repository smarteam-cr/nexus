"use client";

/**
 * PasoPreparacion — antes de la primera reunión: la industria y el perfil (la escala los pide antes
 * de medir), las áreas en juego, lo que ya se sabe y las dimensiones en las que se va a profundizar.
 */
import { useState } from "react";
import { Badge, Button, Input, Segmentado, Select } from "@/components/ui";
import { estaDebajo } from "@/lib/escala/chequeo";
import { CIERRES, DESPUES, type Cierre, type Despues } from "@/lib/escala/documento/tipos";
import { ETIQUETA_DEL_MOTIVO, MOTIVOS_PARA_EXPLORAR, normalizarTexto, type MotivoParaExplorar } from "@/lib/exploraciones/contenido";
import { Casilla } from "./Casilla";
import { useLienzo } from "./contexto";
import PanelDelAgente from "./PanelDelAgente";
import { Propuestas } from "./Propuestas";

/** Hasta cuántas dimensiones por área se profundiza: lo que cabe en la segunda reunión. */
export const MAX_A_EXPLORAR_POR_AREA = 4;

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
  const pendientes = pendientesPara((d) => d.tipo === "edicion" || d.tipo === "perfil");
  const definicion = (p: typeof escala.perfil.cierre, nombre: string) =>
    p?.opciones.find((o) => normalizarTexto(o.nombre) === normalizarTexto(nombre))?.definicion;
  const opcionesCierre = CIERRES.map((c) => ({ clave: c, etiqueta: c === "con equipo" ? "Con equipo" : c === "transaccional" ? "Transaccional" : "Mixta", title: definicion(escala.perfil.cierre, c) }));
  const opcionesDespues = DESPUES.map((d) => ({ clave: d, etiqueta: d === "única" ? "Relación única" : d === "recompra" ? "Recompra" : "Relación continua", title: definicion(escala.perfil.despues, d) }));

  return (
    <Tarjeta
      titulo="Industria y perfil de negocio"
      ayuda="La escala se lee con la edición de su industria (o la general) y cada criterio aplica según cómo vende la empresa. Se decide antes de medir."
    >
      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <label className="space-y-1.5">
          <span className="block text-xs font-medium text-fg-secondary">Industria (edición de la escala)</span>
          <Select
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
          {exp.empresa.industria && <span className="block text-xs text-fg-muted">En HubSpot: {exp.empresa.industria}</span>}
        </label>
        <div className="space-y-2">
          <span className="block text-xs font-medium text-fg-secondary">Cómo cierra la venta y qué pasa después</span>
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

function DimensionesAExplorar() {
  const { exp, escala, chequeo, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const e = exp.estado;
  const pendientes = pendientesPara((d) => d.tipo === "aExplorar");
  if (e.areas.length === 0) return null;

  return (
    <Tarjeta
      titulo="Dimensiones a explorar"
      ayuda={`Solo se profundiza en las que quedan debajo de Funcional, las que tocan una meta del cliente y las que dejan ver un riesgo. Como máximo ${MAX_A_EXPLORAR_POR_AREA} por área; el resto lo verifica el CSE.`}
    >
      {e.areas.map((areaId) => {
        const area = escala.areas.find((a) => a.id === areaId);
        const calculo = chequeo.areas.find((a) => a.id === areaId);
        if (!area) return null;
        const elegidas = area.dimensiones.filter((d) => d.id in e.contenido.aExplorar).length;
        return (
          <div key={areaId} className="space-y-2">
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
                  const nivel = calculo?.dimensiones.find((x) => x.id === d.id)?.nivel ?? null;
                  const sugerida = !!nivel && estaDebajo(nivel, "F");
                  return (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="flex min-w-0 items-center gap-2 text-sm text-fg">
                        {d.nombre}
                        {sugerida && !marcada && (
                          <Badge size="xs" variant="info">
                            Debajo de Funcional
                          </Badge>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        {marcada && (
                          <Select
                            aria-label={`Por qué explorar ${d.nombre}`}
                            value={marcada.motivo}
                            disabled={!puedeEditar || guardando}
                            onChange={(ev) =>
                              void cambiar([{ op: "aExplorar", dimensionId: d.id, valor: { ...marcada, motivo: ev.target.value as MotivoParaExplorar } }])
                            }
                          >
                            {MOTIVOS_PARA_EXPLORAR.map((m) => (
                              <option key={m} value={m}>
                                {ETIQUETA_DEL_MOTIVO[m]}
                              </option>
                            ))}
                          </Select>
                        )}
                        {puedeEditar && (
                          <Button
                            size="xs"
                            className="whitespace-nowrap"
                            variant={marcada ? "ghost" : "secondary"}
                            disabled={guardando}
                            aria-pressed={!!marcada}
                            onClick={() =>
                              void cambiar([
                                {
                                  op: "aExplorar",
                                  dimensionId: d.id,
                                  valor: marcada ? null : { motivo: sugerida ? "indicio" : "meta" },
                                },
                              ])
                            }
                          >
                            {marcada ? "Se explora" : "Explorar"}
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </div>
        );
      })}
      <Propuestas items={pendientes} />
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
      <DimensionesAExplorar />
    </div>
  );
}
