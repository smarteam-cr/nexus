"use client";

/**
 * components/tareas/chips.tsx — los chips de una fila de tarea: para quién, proyecto, vence, agenda, pases.
 *
 * Qué dice cada tono (docs/tareas-plan.md, diseño v3): neutro = un dato; ámbar = algo que pide revisar («pasó 3
 * veces», «sin agendar»); rojo = atrasada; azul con la chispa = lo que sugirió Nexus. Nunca solo el color: cada chip
 * dice con palabras lo que marca.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PASES_PARA_AVISAR } from "@/lib/tareas/reglas";
import { diaCortoConSemana, diaYHora } from "@/lib/tareas/semana";
import type { TareaVista } from "@/lib/tareas/tipos";

export type TonoDeChip = "neutro" | "ambar" | "rojo" | "azul" | "verde";

const TONO: Record<TonoDeChip, string> = {
  neutro: "border-line bg-surface text-fg-secondary",
  ambar: "border-warn-line bg-warn-surface text-warn-ink",
  rojo: "border-danger-line bg-danger-surface text-danger-ink",
  azul: "border-info-line bg-info-surface text-brand",
  verde: "border-success-line bg-success-surface text-success-ink",
};

export function Chip({ children, tono = "neutro", title, className }: { children: ReactNode; tono?: TonoDeChip; title?: string; className?: string }) {
  return (
    <span title={title} className={cn("inline-flex max-w-[16rem] items-center gap-1 truncate rounded-full border px-2 py-[1px] text-[11px] font-medium leading-4", TONO[tono], className)}>
      {children}
    </span>
  );
}

/** «3 h» · «45 min» · «sin estimar». */
export function horas(minutos: number | null | undefined): string {
  if (!minutos) return "sin estimar";
  if (minutos < 60) return `${minutos} min`;
  const h = minutos / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1).replace(".", ",")} h`;
}

/** Los chips de una tarea, en el orden en que se leen. */
export function ChipsDeTarea({ t, sinPara = false, sinPedida = false }: { t: TareaVista; sinPara?: boolean; sinPedida?: boolean }) {
  const chips: ReactNode[] = [];
  if (t.privada) chips.push(<Chip key="privada">Solo para mí</Chip>);
  // De dónde viene (etapa 3 de docs/mi-dia-plan.md): una tarea de HubSpot lo dice siempre.
  if (t.hubspot) {
    chips.push(
      <Chip key="hubspot" tono={t.hubspot.error ? "ambar" : "neutro"} title={t.hubspot.error ?? (t.hubspot.nacioEnNexus ? "También está en HubSpot: lo que cambies acá se escribe allá" : "Viene de HubSpot: lo que cambies acá se escribe allá")}>
        {t.hubspot.rotulo}
        {t.hubspot.error ? " · sin escribir allá" : ""}
      </Chip>,
    );
  }
  // De dónde salió (ficha A, 2026-10-17): una reunión con el cliente, el sprint interno, el chat o un siguiente paso.
  // Lo que se anotó a mano no lleva chip (es lo normal) y lo de HubSpot ya tiene el suyo.
  if (t.de && t.de.clave !== "mano" && t.de.clave !== "hubspot") {
    chips.push(
      <Chip key="de" title={`De dónde viene: ${t.de.etiqueta}`}>
        {t.de.etiqueta}
      </Chip>,
    );
  }
  if (!sinPara) {
    if (t.ambito.ambito !== "sin_clasificar") chips.push(<Chip key="para" title={`Para quién: ${t.ambito.etiqueta}`}>{t.ambito.etiqueta}</Chip>);
  }
  if (t.proyectoHubspot) {
    chips.push(
      <Chip key="hs" title="Proyecto de HubSpot" tono={t.proyectoHubspot.cerrado ? "ambar" : "neutro"}>
        HubSpot · {t.proyectoHubspot.nombre}
        {t.proyectoHubspot.cerrado ? " · cerrado" : ""}
      </Chip>,
    );
  }
  if (t.proyecto) chips.push(<Chip key="proy" title="Proyecto">{t.proyecto.nombre}</Chip>);
  for (const e of t.etiquetas ?? []) chips.push(<Chip key={`et-${e}`} title="Etiqueta">#{e}</Chip>);
  if (t.venceEl) {
    chips.push(
      <Chip key="vence" tono={t.atrasada ? "rojo" : "neutro"}>
        {t.atrasada ? "Atrasada · vencía" : "Vence"} {diaCortoConSemana(t.venceEl)}
      </Chip>,
    );
  }
  const espera = t.esperando.find((r) => r.abierta);
  if (espera && (t.estado === "pendiente" || t.estado === "en_curso")) {
    chips.push(
      <Chip key="espera" tono="ambar" title={espera.titulo ? `Espera a T-${espera.numero} «${espera.titulo}»` : "Espera a una tarea que no ves"}>
        Esperando a T-{espera.numero}
        {t.esperando.filter((r) => r.abierta).length > 1 ? ` y ${t.esperando.filter((r) => r.abierta).length - 1} más` : ""}
      </Chip>,
    );
  }
  if (t.pases >= PASES_PARA_AVISAR) chips.push(<Chip key="pases" tono="ambar">Pasó {t.pases} veces</Chip>);
  else if (t.pases > 0) chips.push(<Chip key="pases">Pasó {t.pases === 1 ? "1 vez" : `${t.pases} veces`}</Chip>);
  // En la lista de lo que pediste, quien mira ES quien la pidió: «Te la pidió» sobraría (y diría su propio nombre).
  if (!sinPedida && t.pedidaPor && t.responsable && t.pedidaPor.email !== t.responsable.email) {
    chips.push(<Chip key="pedida">Te la pidió {t.pedidaPor.nombre.split(" ")[0]}{t.pedidaPorEquipoNombre ? ` (${t.pedidaPorEquipoNombre})` : ""}</Chip>);
  }
  return chips.length ? <span className="flex min-w-0 flex-wrap items-center gap-1">{chips}</span> : null;
}

/** El chip de la agenda de una tarea de la semana. */
export function ChipDeAgenda({ t }: { t: TareaVista }) {
  if (t.estado === "hecha") return null;
  if (t.agenda.estado === "agendada" && t.agenda.inicio) {
    // Sin `toLocale…`: Node y el navegador lo escriben distinto y la pantalla no hidrata.
    return <Chip tono="verde">En tu agenda · {diaYHora(t.agenda.inicio)}</Chip>;
  }
  if (t.agenda.estado === "ya_no_esta") return <Chip tono="ambar">Ya no está en tu agenda</Chip>;
  return <Chip tono="ambar">Sin agendar</Chip>;
}

/**
 * El estado de algo que pediste, con palabras: lo usa «Lo que delegaste» y lo pedido a otros equipos. Azul solo en lo
 * que todavía espera la decisión de la otra persona (es una sugerencia); verde lo hecho; ámbar lo que no va a pasar.
 */
export function ChipDeEstadoDelPedido({ t }: { t: TareaVista }) {
  if (t.estado === "propuesta") return <Chip tono="azul">Todavía no decide</Chip>;
  if (t.estado === "hecha") return <Chip tono="verde">Hecha</Chip>;
  if (t.estado === "no_se_hara") return <Chip tono="ambar">Ya no se hará</Chip>;
  if (t.estado === "rechazada") return t.decision === "retirada" ? <Chip>Pedido retirado</Chip> : <Chip tono="ambar">Descartada</Chip>;
  if (t.estado === "vencida") return <Chip tono="ambar">Nadie la decidió</Chip>;
  if (t.estado === "fusionada") return <Chip>Era otra tarea</Chip>;
  if (t.estado === "en_curso") return <Chip>En curso</Chip>;
  return <Chip>Pendiente</Chip>;
}
