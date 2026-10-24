# Dos mejoras al kickoff — plan

> Pedido de Elías del 2026-10-23. **Nada construido.** En el roadmap es el área Q. El kickoff es un documento que ve el
> cliente: sigue el contrato §1-WEB de ARCHITECTURE.md (motor de documentos, tema claro, vista externa y PDF), y una
> sección nueva entra al registro congelado (`lib/landing/registry.test.ts`) como decisión de producto.

## Lo que hay hoy

- **El kickoff** (`components/landing/configs/kickoff.defs.ts`) tiene estas secciones: bienvenida, objetivos, hoy contra
  el sistema, alcance, equipo, «Lo que necesitamos de tu equipo», métricas de éxito, punto de partida en la escala,
  horarios, canales, próximos pasos, cronograma, procesos y cierre.
- **HubSpot Academy:** no aparece en ninguna parte.
- **El acceso al portal:** solo a medias. «Lo que necesitamos de tu equipo» le pide al agente «disponibilidad, accesos,
  decisores, datos», pero nada garantiza que el acceso al portal aparezca, y Nexus no sigue si el cliente lo dio.

## Q1 · La ruta de HubSpot Academy

- **Qué ve el cliente:** una sección nueva, «Tu ruta en HubSpot Academy», con las listas de reproducción que le
  asignamos por rol (líderes, Ventas, Marketing, Servicio), cada una con su enlace, cuánto dura y para quién es.
- **De dónde sale:** un catálogo de listas que mantiene Smarteam (nombre, enlace, hub, rol y duración). El agente elige
  según los hubs contratados y las personas del equipo del cliente, y el CSE ajusta.
- **Etapas:**
  1. El catálogo de listas, editable por el equipo.
  2. La sección en el kickoff, con su definición, su registro y la vista externa y el PDF.
  3. Más adelante: que la adopción (área F) mire quién terminó su lista.

## Q2 · El acceso a su portal

- **Qué ve el cliente:** el pedido fijo de darnos acceso a su portal de HubSpot, con los pasos (a quién invitar, con qué
  permisos) y para cuándo. Va dentro de «Lo que necesitamos de tu equipo», como primera tarjeta, siempre; no depende de
  que el agente lo escriba.
- **Qué ve el CSE:** si el acceso ya está dado o falta, marcado a mano en el proyecto. Más adelante, Nexus lo comprueba
  solo al conectar el portal del cliente: hoy falta conectar los portales de los clientes, ver la auditoría del portal.
- **Etapas:**
  1. La tarjeta fija con los pasos y el texto en tuteo, revisado por Elías.
  2. El estado del acceso en el proyecto, con un aviso al CSE mientras falte.
  3. La comprobación automática cuando los portales de los clientes estén conectados.
