# La integración con HubSpot — plan

> Pedido de Elías del 2026-10-23: aprovechar lo que la API de HubSpot permite. Investigado el 2026-10-24 contra el código,
> el portal en solo lectura y la documentación oficial. **Nada construido.** En el roadmap es el área U (U6 a U13), y se
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
  - el refresh está copiado 3 veces y el reintento ante un 401, en 5 lugares;
  - ante un 429 no hay espera ni reintento.
- **Lo que escribe:** la ficha (`nexus_*` y una nota), los encargados, el handoff (proyecto 0-970), el siguiente paso, las
  tareas y los borradores sociales (por `broadcast/v1`, que es legacy).

**Medido hoy:**
- la app es OAuth pública, con un límite de 110 llamadas cada 10 segundos;
- faltan los permisos de leads y de transcripciones (403);
- **correos copiados: 0**, porque falta `sales-email-read`;
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

1. **U6 · Un solo transporte de HubSpot.**
   - Un pedido común: refresca el token ante un 401 sin carreras, espera y reintenta ante un 429 respetando
     `Retry-After`, y lee los encabezados del límite.
   - Una sola lista de propiedades de la empresa, la de R2.
   - Es la base de todo lo demás: sin esto, sumar webhooks o leads da más errores de límite.
2. **U7 · Los resúmenes y las transcripciones de HubSpot como contexto.**
   - El tipo «reunión» en las comunicaciones, con el resumen de Notetaker, que funciona hoy.
   - El permiso de transcripciones como opcional, para probarlo.
   - Son 770 reuniones y 646 llamadas que hoy no entran.
   - Cuidado:
     - no duplicar las reuniones que ya llegan por Meet (se filtra por su origen);
     - su dueño sale de las asociaciones y respeta la invariante de no mezclar clientes.
3. **U8 · Los correos:** pedir `sales-email-read` y reconectar HubSpot (está en «Lo que configuras tú»). Hoy no entra
   ningún correo.
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
7. **U12 · Los leads** (es B3): el permiso como opcional y la copia, para Ventas y la preventa.
8. **U13 · Nexus dentro de HubSpot.**
   - Una tarjeta de solo lectura en la ficha de la empresa y del negocio: la etapa, el siguiente paso, el cronograma, la
     escala y el enlace a Nexus.
   - Pide migrar la app a la plataforma nueva de desarrolladores, cruzar el usuario por correo y respetar el acceso a cada
     cliente.
9. **U14 · Salir de lo legacy antes de septiembre de 2027:** la API v1 de engagements, `broadcast/v1` y la app pública
   legacy. Es requisito de U10 y U13.

La escritura de la empresa en los dos sentidos, con propiedades para reportar, es R2:
`docs/empresa-datos-hubspot-plan.md`.

## Orden

1. U6 y U8.
2. U7 y U9.
3. U11 y U12.
4. U10.
5. U14 y U13.

## Por confirmar

- Si las transcripciones de HubSpot salen por la API una vez concedido el permiso.
- El plan que piden los leads y las tarjetas privadas.
- Si Smarteam tiene Sales Hub Pro y Data Hub Pro.
