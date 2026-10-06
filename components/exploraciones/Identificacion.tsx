"use client";

/**
 * Identificacion — con qué se mide la preventa: la industria (la edición de la escala), el perfil de
 * negocio y los datos para comparar después (país y tamaño).
 *
 * La industria y el perfil se ELIGEN SOLOS (pedido de Elías, 2026-10-01): por la industria de HubSpot
 * o, si no alcanza, por el agente que lee todo lo de la empresa; con la edición va su perfil habitual.
 * Se ve quién los eligió y por qué, y se cambian con un clic.
 *
 * Rediseño del 2026-10-05 (tablero «Preventa · La escala»): una fila de filtros, como en la sección
 * Escala, y país y tamaño en una línea con «Editar». Las áreas en juego pasaron a ser las pestañas
 * del mapa (PasoEscala); los porqués de cada área se siguen guardando, pero ya no se escriben acá. Lo
 * que sugiere el agente va arriba de la pieza, una sola vez.
 */
import { useState } from "react";
import { Badge, Input, Segmentado, Select } from "@/components/ui";
import { CIERRES, DESPUES, type Cierre, type Despues } from "@/lib/escala/documento/tipos";
import { industriaDelVendedor, normalizarTexto, type EscalaSugerida, type Medicion } from "@/lib/exploraciones/contenido";
import { industriaLegible, sugerirEdicion } from "@/lib/exploraciones/industria";
import { useLienzo } from "./contexto";
import { BotonBlanco } from "./FranjaDeSugerencias";
import { useCorrida } from "./useCorrida";

const NOMBRE_DEL_CIERRE: Record<Cierre, string> = { "con equipo": "Con equipo", transaccional: "Transaccional", mixta: "Mixta" };
const NOMBRE_DEL_DESPUES: Record<Despues, string> = { única: "Relación única", recompra: "Recompra", continua: "Relación continua" };

/** El rótulo chico de cada filtro. */
function Rotulo({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  const clase = "block text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted";
  return htmlFor ? (
    <label htmlFor={htmlFor} className={clase}>
      {children}
    </label>
  ) : (
    <span className={clase}>{children}</span>
  );
}

/** País y tamaño: la escala los pide en toda medición, para poder comparar con el tiempo. */
function ParaComparar() {
  const { exp, cambiar, puedeEditar } = useLienzo();
  const guardada = exp.estado.contenido.medicion;
  const [editando, setEditando] = useState(false);
  const [m, setM] = useState<Medicion>(guardada);
  const [vista, setVista] = useState(guardada);
  if (vista !== guardada) {
    setVista(guardada);
    setM(guardada);
  }
  const resumen = [
    guardada.pais,
    guardada.personasEmpresa && `${guardada.personasEmpresa} personas en la empresa`,
    guardada.personasEquipo && `${guardada.personasEquipo} en el equipo que se mira`,
  ].filter(Boolean);
  const campo = (k: keyof Medicion, etiqueta: string, placeholder: string) => (
    <label className="space-y-1.5">
      <span className="block text-xs font-medium text-fg-secondary">{etiqueta}</span>
      <Input
        value={m[k] ?? ""}
        disabled={!puedeEditar}
        placeholder={placeholder}
        onChange={(e) => setM((x) => ({ ...x, [k]: e.target.value }))}
        onBlur={() => {
          if ((m[k] ?? "") !== (guardada[k] ?? "")) void cambiar([{ op: "medicion", medicion: { [k]: (m[k] ?? "").trim() } }]);
        }}
      />
    </label>
  );
  return (
    <div className="space-y-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-fg-secondary">
        <span>
          <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Para comparar después</span>
          {resumen.length > 0 ? resumen.join(" · ") : <span className="text-fg-muted">sin país ni tamaño todavía</span>}
        </span>
        {puedeEditar && (
          <button type="button" className="px-1.5 py-1 text-xs font-semibold text-brand hover:underline" aria-expanded={editando} onClick={() => setEditando((x) => !x)}>
            {editando ? "Listo" : "Editar"}
          </button>
        )}
      </div>
      {editando && (
        <div className="grid gap-3 sm:grid-cols-3">
          {campo("pais", "País", "Por ejemplo, Costa Rica")}
          {campo("personasEmpresa", "Personas en la empresa", "Por ejemplo, 120")}
          {campo("personasEquipo", "Personas en el equipo que se mira", "Por ejemplo, 6")}
        </div>
      )}
    </div>
  );
}

export function ConQueSeMide() {
  const { exp, escala, cambiar, puedeEditar, guardando } = useLienzo();
  const { corriendo, lanzando, lanzar } = useCorrida();
  const e = exp.estado;
  const elegida = e.contenido.edicionElegida;
  const edicion = escala.ediciones.find((x) => x.slug === e.edicion) ?? null;
  const habitual = edicion?.perfilHabitual ?? null;
  const esElHabitual = !!habitual && habitual.cierre === e.perfilCierre && habitual.despues === e.perfilDespues;
  const definicion = (p: typeof escala.perfil.cierre, nombre: string) =>
    p?.opciones.find((o) => normalizarTexto(o.nombre) === normalizarTexto(nombre))?.definicion;
  const opcionesCierre = CIERRES.map((c) => ({ clave: c, etiqueta: NOMBRE_DEL_CIERRE[c], title: definicion(escala.perfil.cierre, c) }));
  const opcionesDespues = DESPUES.map((d) => ({ clave: d, etiqueta: NOMBRE_DEL_DESPUES[d], title: definicion(escala.perfil.despues, d) }));

  /* La sugerida: la que guardó la exploración (la industria de HubSpot al abrirla, o el agente al
     preparar) o, si es vieja y no la tiene, la que dice la industria de HubSpot. */
  const sugerida: EscalaSugerida | null =
    elegida?.sugerida ??
    (() => {
      const slug = sugerirEdicion(exp.empresa.industria, escala.ediciones.map((x) => x.slug));
      const ed = slug ? escala.ediciones.find((x) => x.slug === slug) : null;
      return ed
        ? {
            edicion: ed.slug,
            cierre: ed.perfilHabitual?.cierre ?? null,
            despues: ed.perfilHabitual?.despues ?? null,
            por: "industria" as const,
            razon: `La industria de la empresa en HubSpot es «${industriaLegible(exp.empresa.industria)}».`,
          }
        : null;
    })();
  const delVendedor = industriaDelVendedor(e);
  const distintaDeLaSugerida =
    !!sugerida && delVendedor && (sugerida.edicion !== e.edicion || sugerida.cierre !== e.perfilCierre || sugerida.despues !== e.perfilDespues);
  const nombreDeLaSugerida = sugerida
    ? [
        sugerida.edicion ? (escala.ediciones.find((x) => x.slug === sugerida.edicion)?.nombre ?? sugerida.edicion) : "Escala general",
        sugerida.cierre && NOMBRE_DEL_CIERRE[sugerida.cierre].toLowerCase(),
        sugerida.despues && NOMBRE_DEL_DESPUES[sugerida.despues].toLowerCase(),
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const quien = delVendedor
    ? { insignia: "La elegiste tú", texto: "El agente ya no la cambia." }
    : elegida?.por === "agente"
      ? { insignia: "Automática", texto: elegida.razon ?? "La eligió el agente con lo que hay en HubSpot." }
      : elegida?.por === "industria"
        ? { insignia: "Automática", texto: elegida.razon ?? "Por la industria de la empresa en HubSpot." }
        : { insignia: null, texto: "El agente la elige al preparar, con lo que hay de la empresa en HubSpot." };
  const delHabitual =
    edicion && habitual
      ? esElHabitual
        ? "Es el perfil habitual de esa industria."
        : `El habitual de «${edicion.nombre}» es ${NOMBRE_DEL_CIERRE[habitual.cierre].toLowerCase()} · ${NOMBRE_DEL_DESPUES[habitual.despues].toLowerCase()}.`
      : null;

  return (
    <section data-recorrido="preventa.escala.edicion" aria-label="Con qué se mide" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="flex min-w-[220px] flex-[1_1_220px] flex-col gap-1.5">
          <Rotulo htmlFor="exploracion-edicion">Industria</Rotulo>
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
        </div>
        <div className="flex flex-col gap-1.5">
          <Rotulo>Cómo se cierra la venta</Rotulo>
          <Segmentado<Cierre>
            etiqueta="Cómo se cierra la venta"
            opciones={opcionesCierre}
            valor={e.perfilCierre}
            deshabilitado={!puedeEditar || guardando}
            onCambio={(c) => void cambiar([{ op: "perfil", cierre: c, despues: e.perfilDespues }], { refrescar: true })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Rotulo>Qué pasa después de la venta</Rotulo>
          <Segmentado<Despues>
            etiqueta="Qué pasa después de la venta"
            opciones={opcionesDespues}
            valor={e.perfilDespues}
            deshabilitado={!puedeEditar || guardando}
            onCambio={(d) => void cambiar([{ op: "perfil", cierre: e.perfilCierre, despues: d }], { refrescar: true })}
          />
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-secondary">
        {quien.insignia && (
          <Badge size="xs" variant={delVendedor ? "default" : "info"}>
            {quien.insignia}
          </Badge>
        )}
        <span>
          {quien.texto}
          {delHabitual ? ` ${delHabitual}` : ""}
          {exp.empresa.industria ? ` En HubSpot: ${industriaLegible(exp.empresa.industria)}.` : ""}
        </span>
      </p>

      {/* Siempre que la eligió el vendedor hay una salida: volver a la sugerida (aunque sea la misma,
          así el agente la vuelve a manejar) o, si todavía no hay ninguna, pedírsela al agente. */}
      {delVendedor && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2">
          <p className="min-w-0 flex-1 text-xs text-fg-secondary">
            {sugerida ? (
              distintaDeLaSugerida ? (
                <>
                  La sugerida es <span className="font-medium text-fg">{nombreDeLaSugerida}</span>
                  {sugerida.razon ? `: ${sugerida.razon}` : "."}
                </>
              ) : (
                <>Es la misma que sugiere el agente. Restablécela para que la vuelva a manejar él.</>
              )
            ) : (
              <>Todavía no hay una sugerida: el agente la propone al preparar, con lo que hay de la empresa.</>
            )}
          </p>
          {puedeEditar &&
            (sugerida ? (
              <BotonBlanco disabled={guardando} onClick={() => void cambiar([{ op: "restablecerEscala", sugerida }], { refrescar: true })}>
                Restablecer la sugerida
              </BotonBlanco>
            ) : (
              <BotonBlanco disabled={corriendo || lanzando} onClick={() => void lanzar("preparar")}>
                {corriendo || lanzando ? "Preparando…" : "Pedírsela al agente"}
              </BotonBlanco>
            ))}
        </div>
      )}

      <ParaComparar />
    </section>
  );
}
