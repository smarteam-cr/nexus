# La integración con HubSpot — plan

> Pedido de Elías del 2026-10-23: aprovechar lo que la API de HubSpot permite. Investigado el 2026-10-24 contra el código,
> el portal en solo lectura y la documentación oficial. **Nada construido.** En el roadmap es el área U (U6 a U14), y se
> cruza con R2 (la empresa en los dos sentidos), B3 (los leads) y T (las reuniones).

## Lo que hace Nexus hoy

- **Todo se copia por sondeo; no hay webhooks:**
  - cada hora: los negocios abiertos y las metas, los contactos y los tickets, y los correos, las notas y las llamadas;
  - cada 15 minutos: las tareas;
  - una vez al día: las señales de Éxito del cliente (por la API v1 de engagements, que es legacy), los Partner Clients y
    las ventas ganadas.
- **Los proyectos (0-970) no tienen job:** se copian al abrir la ficha del cliente.
- **La copia incremental** (por fecha de modificación) solo la usan las comunicaciones. Los contactos y los tickets se
  releen enteros cada hora.
- **Las fusiones se detectan por síntoma,** comparando el id pedido con el que vuelve. En el portal hay 34 empresas y 1
  proyecto fusionados.
- **El token:**
  - está en texto plano;
  - la llamada HTTP del refresh vive en `refreshAccessToken`, pero el bloque de refrescar y guardar está copiado 5 veces
    (4 en `client.ts` y 1 en `portal-analyzer.ts`), y 7 scripts tienen su propia llamada a `oauth/v1/token`;
  - el reintento ante un 401 está en **14 lugares** (12 en `lib/`, incluidos `exploraciones/hubspot.ts` y
    `ventas/sicop.ts`, más las 2 rutas lookup);
  - ante un 429 solo espera `lib/auditoria-portal/lecturas.ts` (`Retry-After`, o 1, 2 y 4 s), que sirve de molde.
- **Lo que escribe:** la ficha (`nexus_*` y una nota), los encargados, el handoff (proyecto 0-970), el siguiente paso, las
  tareas y los borradores sociales (por `broadcast/v1`, que es legacy).

**Medido hoy:**
- la app es OAuth pública, con un límite de 110 llamadas cada 10 segundos;
- los permisos de leads, de transcripciones y `sales-email-read` se dieron el 24 oct;
- **correos copiados: 0** hasta ese día;
- en el portal hay **770 reuniones y 646 llamadas con transcripción**;
- **el resumen de Notetaker responde con los permisos de hoy.**

## Lo que permite la API (verificado en la documentación)

- **Webhooks:** para empresa, contacto, negocio y ticket, con creación, cambio de propiedad, asociación, borrado y
  **fusión**. Reintenta 10 veces en 24 horas y no cuenta contra el límite. El proyecto 0-970 no aparece en la lista.
- **Asociaciones v4:** con etiquetas propias.
- **El objeto Lead:** con su API completa; pide Sales Hub Pro.
- **El resumen de Notetaker:** resumen y acciones con su responsable, para reuniones y llamadas (no la transcripción).
- **La transcripción:** el endpoint de transcripciones está documentado para las de terceros. No está confirmado que
  devuelva las que genera HubSpot.
- **Búsqueda:** 5 pedidos por segundo y 10.000 resultados como máximo por consulta.
- **Propiedades calculadas** por API; **listas dinámicas;** **metas.**
- **Tarjetas dentro de la ficha (app cards en React):** llaman a Nexus. **Las tarjetas clásicas se apagan el 31 de octubre
  de 2026.**
- **Lo legacy:** las APIs v1 a v4 dejan de tener soporte en septiembre de 2027.

## Las mejoras, por impacto

1. **U6 · Un solo transporte de HubSpot,** en `lib/hubspot/client.ts`.
   - Un pedido común: refresca el token ante un 401 sin carreras (un solo refresh), espera y reintenta ante un 429
     respetando `Retry-After`, y lee los encabezados del límite.
   - Las firmas de `getSystemHubspotClient` y `getSystemAccessToken` no cambian (las usan unos 90 archivos).
   - Comprobar que `numberOfApiCallRetries` del SDK respeta `Retry-After`; si no, el reintento propio va en
     `client.ts`.
   - **El contrato de errores no cambia:** un 429 agotado sigue lanzando y un 403 sigue siendo «sin permiso» (lo exigen
     `contactos-y-tickets.ts:9` y `cs-signals.ts:156` y `:188`).
   - Dos presupuestos de espera: en un job, lo que diga `Retry-After`; en una ruta, 2 s como máximo, y degrada
     (ARCHITECTURE §7, regla 2).
   - Se migra llamador por llamador (precedente: `lib/cobranza/mercury/transporte.ts`).
   - La clasificación de 401 y 403 de `sync-projects.ts:510` (los `\b` perdidos) ya no es de U6: se arregla en el paso
     cero del roadmap, junto con la prueba contra el carácter `\x08`.
   - Pruebas con un `fetch` falso: 401 con un solo refresh aunque haya dos pedidos a la vez, 429 con `Retry-After`, 429
     agotado que lanza, y 403.
   - La lista de propiedades de la empresa es de R2 (`lib/hubspot/empresa.ts`); U6 se junta en `main` antes de que R2
     escriba.
   - Es la base de todo lo demás: sin esto, sumar webhooks o leads da más errores de límite.
2. **U7 · Los resúmenes y las transcripciones de HubSpot como contexto.**
   - El tipo «reunión» en las comunicaciones, con el resumen de Notetaker, que funciona hoy.
   - El permiso de transcripciones como opcional, para probarlo.
   - Son 770 reuniones y 646 llamadas que hoy no entran.
   - *Depende de:* U1 (el código de la reunión). Comprobar que HubSpot guarde el enlace de Meet; si no, se cruza por
     hora y participantes.
   - Cuidado:
     - no duplicar las reuniones que ya llegan por Meet (se filtra por su origen);
     - su dueño sale de las asociaciones y respeta la invariante de no mezclar clientes.
3. **U8 · Los correos:** el permiso `sales-email-read` se dio el 24 oct. Falta comprobar que la copia de cada hora
   traiga los 120 días; copiar todos y leer con IA solo los de las empresas activas o usadas en Nexus. Antes, enmendar
   DECISIONS «Los correos y el timeline de HubSpot, en el contexto de la cuenta (2026-10-18)», que hoy lee con Haiku
   cualquier correo enviado.
4. **U9 · Las fusiones, de forma sistemática.**
   - Una búsqueda diaria de empresas, proyectos, contactos y negocios con fusiones recientes, que propone reapuntar el id
     viejo al nuevo, con simulacro.
   - Después, el evento de fusión por webhook.
5. **U10 · Webhooks donde valen la pena.**
   - Empresa, contacto, negocio y ticket.
   - El receptor valida la firma, guarda el evento en una tabla y responde rápido; cada evento dispara la copia de ese
     registro.
   - El sondeo sigue como red, y los proyectos 0-970 pasan a tener su job.
   - Cuidado: un endpoint público, eventos repetidos o desordenados, y que el webhook no decida el dueño por su cuenta.
6. **U11 · La copia incremental de contactos y tickets,** como las comunicaciones; las bajas, en una pasada completa
   diaria.
7. **U12 · Los leads:** manda B3 (la copia, para Ventas y la preventa); aquí solo el permiso, dado el 24 oct.
8. **U13 · Nexus dentro de HubSpot.**
   - Una tarjeta de solo lectura en la ficha de la empresa y del negocio: la etapa, el siguiente paso, el cronograma, la
     escala y el enlace a Nexus.
   - Pide migrar la app a la plataforma nueva de desarrolladores, cruzar el usuario por correo y respetar el acceso a cada
     cliente.
9. **U14 · Salir de lo legacy antes de septiembre de 2027:** la API v1 de engagements (que también usa
   `lib/exploraciones/hubspot.ts:421`), `broadcast/v1` y la app pública legacy. Es requisito de U10 y U13.

La escritura de la empresa en los dos sentidos, con propiedades para reportar, es R2:
`docs/empresa-datos-hubspot-plan.md`.

## Criterio de éxito

- **U6:** antes, contar una semana de fallas por 401 y 429 (y registrarlas, si hoy no se registran); después, 7 días con
  0, más una prueba estructural de que nadie llama a `api.hubapi.com` fuera del transporte.
- **U8:** entran al menos el 95 % de los correos.
- **U7:** 0 duplicados en una muestra de 20.
- **U9:** de 34 empresas fusionadas a 0.

## Orden

1. U6 (en el paso uno del roadmap).
2. U7, U8 y U9 (en el paso 2, como en el roadmap), con la copia de los leads (B3 etapa 1, junto a T3).
3. U11.
4. U10.
5. U14 y U13.

## Por confirmar

- Si las transcripciones de HubSpot salen por la API una vez concedido el permiso.
- El plan que piden los leads y las tarjetas privadas.
- Si Smarteam tiene Sales Hub Pro y Data Hub Pro.
