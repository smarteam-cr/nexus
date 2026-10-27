# Cuánto dice cada edición con sus palabras

Una edición tiene que hablar del negocio de su industria. La regla, desde la 8.9.1 («Cómo se escribe una edición»): **cada nivel de cada dimensión dice al menos un criterio con las palabras de la industria**, reescrito o propio. Una «celda» es una edición × una dimensión × un nivel: 6 ediciones × 24 dimensiones × 5 niveles = 720.

Se mide con `npx tsx scripts/medir-personalizacion-escala.ts` (solo lee el `.md` del repo; `--todas` lista cada celda). Lo vigila `lib/escala/documento/personalizacion.test.ts`: falla si una celda queda entera con el texto general y no está en `GENERALES_A_PROPOSITO` con su porqué. Correrlo en cada versión.

## Antes y después

| Edición | Sin personalizar en la 8.9.0 | En la 8.9.1 | Reescritos nuevos |
|:--|--:|--:|--:|
| Automotriz | 71 | 0 | 72 |
| Turismo | 64 | 0 | 65 |
| Banca y servicios financieros | 47 | 0 | 108 |
| Inmobiliaria | 44 | 0 | 45 |
| Educación | 10 | 0 | 19 |
| Ecommerce y retail | 8 | 0 | 13 |
| **Total** | **244** | **0** | **322** |

El caso que lo disparó: en Turismo, Inicial de «Seguimiento de cotizaciones y reservas» tenía sus cuatro criterios con el texto general. Hoy dice, por ejemplo, «Cuando una cotización no se contesta o una reserva no se paga, cada persona del equipo decide si insiste y cómo».

## Cómo se hizo

- **Solo reescrituras.** Ningún criterio propio nuevo y ningún identificador nuevo: por eso es un parche (8.9.1), como la 8.4.1. Cada reescrito conserva su identificador, sus marcas, lo que requiere y las palabras con valor fijo; sale de su línea «Se leen igual».
- **Mide lo mismo.** Una segunda pasada comparó cada reescrito con su texto general y corrigió 50 que acotaban o ampliaban lo que se pide: un ejemplo que se volvía la única forma («la campaña de temporada» donde la general dice «las campañas»), un actor de menos («los datos de las solicitudes» dejaba fuera a los prospectos) o una condición nueva. Donde la industria da un caso típico, va como ejemplo entre rayas.
- **Pruebas.** Las de Nexus y `pruebas_escala.py` (las ocho, también contra la 8.9.0 como anterior) pasan, y `publicar-escala.ts` en seco no frena.

## Lo que sigue con el texto general, a propósito

Desde la 9.0.0 (27 oct), 83 celdas: Automotriz 21, Turismo 20, Inmobiliaria 14, Banca y servicios financieros 11, Ecommerce y retail 10, Educación 7. La 9.0 cambió o sacó criterios generales, y lo que cada edición decía de ellos con sus palabras se soltó; se publicó así, con la decisión provisional de reescribirlas en la versión siguiente (manual de operación 1.4.0, «Decisiones provisionales de la 9.0»). Están en `GENERALES_A_PROPOSITO`, y la lista solo encoge.

Hasta la 8.9.1, ninguna celda. Dentro de las celdas, quedan criterios que se leen igual porque no ganan nada con palabras de la industria: por ejemplo, en Ecommerce y retail y en Educación, que el proceso de Marketing se cumpla sin que nadie lo vigile (`2.1.O5`). La celda igual queda personalizada por otro criterio del mismo nivel.

Si una versión futura deja una celda entera con el texto general, se anota en `GENERALES_A_PROPOSITO` con su porqué, o se reescribe uno de sus criterios.

## Para mirar con calma

Reescritos que suman un ejemplo de la industria y conviene leer con ojo de dueño (la revisión los dejó porque no cambian lo que se mide):

- **Turismo** `1.8.D2`: habla de las cotizaciones que no terminan en reserva; las reservas canceladas las mide su criterio propio de Funcional.
- **Inmobiliaria** `1.8.D1`: dice «un interesado no compra o una reserva se cae» donde la general dice «se pierde un negocio».
- **Banca** `3.4.O3`: el crecimiento de los clientes se lee como los productos que suman.
- **Automotriz** `3.4.D1`: «sin responsable» en vez de «sin dueño», para no confundirlo con el dueño del vehículo.
