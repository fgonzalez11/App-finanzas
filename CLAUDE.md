# Finanzas de Fa

App personal de registro de gastos. **No es un producto, no se comercializa.** El único
usuario es Fa (Claudio Fabricio González, Río Gallegos, Argentina) y la única vara de
éxito es que la use todos los días.

---

## Por qué existe (leer antes de proponer nada)

Fa llevaba cuatro años de gastos en un Excel. Nunca lo abandonó —52 meses sin un
hueco— pero **dejó de cargar el detalle** porque era tedioso: tenía que sentarse en la
PC y se olvidaba. Los números lo muestran:

| Año  | Movimientos por mes | Categorías distintas usadas |
|------|--------------------:|----------------------------:|
| 2022 | 30,5                | 25 |
| 2023 | 18,2                | 23 |
| 2024 | 28,5                | 25 |
| 2025 | 19,8                | 21 |
| 2026 | **8,3**             | **11** |

Lo primero que se cayó fue justo lo que se paga con tarjeta y lo que se compra suelto:
lo que no podés cargar sentándote el domingo a la noche porque ya no te acordás.

**La brújula, dicha por él:** lo que baja la fricción al cargar y lo que da claridad
del mes en curso vale más que cualquier informe histórico lindo. El histórico le sirve
como referencia personal, no es el foco. En la pantalla del mes quiere ver tres cosas:
**los gastos, el disponible y el proyectado.** No invertir esfuerzo en analítica del
pasado ni en gráficos de evolución.

Los 8,3 movimientos por mes de 2026 son la línea de base: en unos meses se puede mirar
el mismo número y saber si esto sirvió de verdad.

---

## Reglas de trabajo con Fa

Son de él, textuales o acordadas, y no son negociables:

1. **Conversar antes de desarrollar.** "Pedime confirmación antes de ponerte a
   desarrollar para que unifiquemos criterios." Él junta observaciones, se responde qué
   se haría y qué decisiones son suyas, se acuerda, y recién ahí se escribe código.
   La única excepción son los bugs que bloquean o que ensucian datos.
2. **Una entrega, un deploy.** Desplegar le cuesta trabajo manual, así que se juntan
   los cambios en tandas en vez de mandarle un archivo por cada arreglo.
3. **Preferir resolver del lado de la app.** Subir la app es `git push`; tocar el
   backend implica pegar archivos `.gs` a mano y crear una versión nueva de la
   implementación. Si algo se puede hacer en `pwa/index.html`, se hace ahí.
4. **Mostrarle una captura antes de que despliegue** cuando cambia la interfaz. Las
   pruebas sacan capturas en un iPhone simulado; se le mandan y si no le cierra se
   corrige antes de que suba nada.
5. **Se le habla en castellano rioplatense**, sin diminutivos ni jerga de consultora.
   Los comentarios del código también van en castellano y explican *por qué*, no *qué*.

---

## Arquitectura

Cuatro piezas, sin servidor propio ni base de datos:

```
Telegram  ──┐
            ├──►  Apps Script (webhook + API)  ──►  Google Sheet
PWA iPhone ─┘                                        (la fuente de la verdad)
```

- **Google Sheet** — es la base de datos. Fa la abre, la filtra y la ordena cuando
  quiere. El código no puede asumir nada sobre el orden de las filas (ver Trampas).
- **Apps Script** (`apps-script/*.gs`) — backend serverless atado a la planilla.
  `doPost` atiende el webhook de Telegram, `doGet` atiende la app por JSONP.
  Los secretos viven en Propiedades del Script, nunca en la planilla ni en el código.
- **Bot de Telegram** — la vía principal de carga. Texto, audio y foto de ticket.
  Es lo que hace que cargar sea de todos los días.
- **PWA** (`pwa/`) — un solo archivo HTML en el teléfono. Sirve para ver el mes,
  revisar, editar, importar el resumen de la tarjeta y depurar categorías.

### Archivos

| Archivo | Qué hay adentro |
|---|---|
| `apps-script/00_Config.gs` | Constantes, `VERSION`, menú de la planilla, configuración de secretos |
| `apps-script/01_Setup.gs` | Creación y formato de las hojas, semillas, disparador de recordatorios |
| `apps-script/02_Parser.gs` | Interpretación del texto libre: monto, fecha, categoría, cuotas, medio |
| `apps-script/03_Datos.gs` | Toda la lectura y escritura sobre la planilla. El corazón |
| `apps-script/04_IA.gs` | Gemini para audios, fotos y frases que las reglas no entienden |
| `apps-script/05_Telegram.gs` | Webhook, mensajes, botones, comandos, recordatorios |
| `apps-script/06_Api.gs` | `doGet`/`doPost`, importación del resumen de tarjeta, ops de la app |
| `pwa/index.html` | La app entera: estilos, pantallas y lógica |
| `pwa/resumen.js` | Lector de PDF de resumen de tarjeta (corre en el teléfono) |
| `pwa/sw.js` | Service worker: la app abre sin señal |
| `build.js` | Mete `resumen.js` adentro de `index.html` y escribe la raíz del repo |
| `test/` | Pruebas. Ver abajo |
| `index.html`, `sw.js` (raíz) | **GENERADOS.** No editar: los pisa `node build.js` |

---

## Modelo de datos

Es el de Fa, heredado de su Excel. **No inventar categorías ni tipos.**

Dos niveles: **Tipo de movimiento** → **Categoría**.

| Tipo | Naturaleza | ¿Cuenta como gasto? |
|---|---|---|
| `00. Saldo inicial` | Movimiento | no |
| `01. Cobros` | Ingreso | no |
| `02. Pagos esenciales` | Gasto | sí |
| `03. Pagos secundarios` | Gasto | sí |
| `04. Cuota alimentaria` | Gasto | sí |
| `05. Préstamos` | Movimiento | no |

- **El importe se guarda CON SIGNO.** Ingresos positivos, gastos negativos.
- **Naturaleza `Movimiento`** = plata que sale y vuelve. No es gasto ni ingreso.
- **Las cuotas de tarjeta cuentan en el mes en que se PAGAN**, no en el que se compró.
  Decisión de Fa.

### Personas: dos lecturas que NO se suman

Una persona tiene dos números y salen solos de la naturaleza del tipo:

- **saldo** — solo movimientos de naturaleza `Movimiento` (préstamos). Es una cuenta
  corriente: negativo = plata que puso Fa y todavía no volvió.
- **gastado en** — movimientos de naturaleza `Gasto`. Plata que se fue y no vuelve.

No hay que clasificar a las personas ni agregar columnas: cualquier persona nueva
funciona sin configurar nada.

- **Nikin** (hermano) — préstamos que van y vienen. Tiene saldo, no tiene gastado.
- **Noe** (ex pareja) — cuota alimentaria. Saldo $0, gastado $21 M.
- **Bastian** (hijo) — etiqueta para saber cuánto se gasta en él. Nunca genera saldo.

Mezclarlas mostraba "Noe −$21.030.900" como si fuera una deuda. **A un hijo no le
debés plata: gastás en él.**

### Columnas de `Movimientos`

`ID · Fecha · Tipo · Categoria · Importe · Moneda · Persona · Detalle · Medio · Origen · Notas · CreadoEn · Hash`

- `ID` — lo puede generar la app antes de mandar (idempotencia, ver Trampas).
- `Hash` — `fecha|importe|detalle`. Sirve para el antiduplicados de la importación.
  **No se recalcula si editás el Detalle a mano.**
- `CreadoEn` — desempata movimientos del mismo día sin depender de la posición.

---

## Cómo se prueba

No hay framework: son scripts de Node que corren el backend REAL contra los datos
migrados de Fa. `test/shim.js` emula Apps Script (SpreadsheetApp, Utilities,
UrlFetchApp, CacheService, LockService) leyendo `test/datos.json`.

```bash
node test/test_parser.js      # interpretación de texto libre (27 casos)
node test/test_backend.js     # resúmenes, categorías, personas, disponible, orden
node test/test_webhook.js     # webhook, reintentos, idempotencia, botones
node test/test_cuotas.js      # planes en cuotas de punta a punta
node test/test_resumen.js     # lector de PDF contra el resumen real

node test/server.js                    # servidor de prueba en :8099 (sirve pwa/)
DIST=1 node test/server.js             # sirve el bundle final, que es lo que se publica

node test/test_app.js         # comportamiento de la app en un iPhone simulado
node test/shots.js            # capturas de todas las pantallas
node test/shots_pdf.js        # capturas del lector de resumen
```

Los tres últimos necesitan el servidor levantado. Playwright usa el Chromium ya
instalado; **no correr `playwright install`**.

**El shim tiene que ser tan limitado como Apps Script de verdad.** Cuando implementaba
`Utilities.formatString('%,.2f')` correctamente, las pruebas pasaban en verde mientras
producción mostraba `$ %.,2f`. Si una API de Google no soporta algo, el shim tampoco.

---

## Cómo se despliega

**Backend** — cuando cambia algún `.gs`:
1. Pegar los archivos cambiados en el editor de Apps Script.
2. **Gestionar implementaciones → ✏️ → Versión: Nueva.**
   *"Nueva implementación" crea una URL distinta y Telegram sigue apuntando a la
   vieja.* Es el error clásico.
3. Verificar con `/ping` en el bot o con `🩺 Diagnosticar el bot`: tiene que decir
   la `VERSION` de `00_Config.gs`.

**App** — cuando cambia `pwa/`:
```bash
node build.js && git add -A && git commit -m "..." && git push
```
GitHub Pages publica la raíz. La app detecta la versión nueva y se recarga sola;
si hace falta forzarla, en **Más → ⬇️ Buscar actualización**. Abajo de todo en Más
se ve qué versión está corriendo (`APP_VER`).

---

## Trampas aprendidas a los golpes

Cada una costó un bug en producción. Están en orden de cuánto dolieron.

1. **`doPost` no puede devolver `ContentService` en la rama de Telegram.** Apps Script
   contesta **302** y Telegram no sigue redirects: reintenta para siempre y carga el
   mismo gasto una y otra vez. Va un `return;` pelado. *(12 naftas duplicadas.)*

2. **Un timeout de JSONP NO significa que no se haya guardado.** Apps Script puede
   haber escrito la fila y contestado tarde. Por eso la app genera el `ID` antes de
   mandar y lo repite en cada reintento: el backend rechaza un ID que ya existe.
   Ninguna traba del lado del teléfono alcanza, porque el teléfono nunca se entera de
   cómo terminó. *(Un gimnasio triplicado.)*

3. **La planilla es de Fa y la va a ordenar y filtrar.** Ordenar desde el filtro mueve
   las filas de verdad. Nada puede asumir que lo recién cargado está al final:
   `listarMovimientos_` leía las últimas 240 filas y los movimientos nuevos
   desaparecían de la lista mientras el gasto del mes los seguía contando.

4. **`Utilities.formatString` no soporta el flag de miles (`%,.2f`).** Hay
   `formatearMoneda_` / `separarMiles_` escritos a mano. No volver a intentarlo.

5. **`Utilities.formatDate` con `MMMM` sale en el idioma de la cuenta de Google.**
   Por eso `nombreMes_` arma el mes a mano.

6. **Antiduplicados que fallan cerrado dejan al bot mudo**, que es peor que el
   problema. Todo lo defensivo falla ABIERTO: ante la duda, cargar.

7. **Leer la planilla entera varias veces hace que el bot tarde, y si el bot tarda
   Telegram reintenta.** La lentitud no es un problema de comodidad: es el origen de
   los duplicados. `mapasDeCategorias_` hace una sola pasada para todos los
   recordatorios.

8. **En GitHub Pages `resumen.js` no existe suelto** —va incrustado. Mientras el
   service worker lo pedía en `addAll()`, el 404 volteaba la instalación entera, el
   service worker nuevo nunca se activaba y el teléfono quedaba con la versión vieja
   pegada para siempre. Cada archivo se cachea por su cuenta.

9. **pdf.js parte las palabras acentuadas**: "DÓLARES" sale como "D" + "LARES". El
   lector detecta columnas por la coordenada x de cada palabra, no por el texto.

10. **El banco numera las cuotas por mes de cierre y Fa por mes de pago.** Hay un mes
    de corrimiento y está contemplado.

11. **`DIST=0` es verdadero en JavaScript.** El servidor de prueba compara con `'1'`.

12. **No escribir fechas fijas en las pruebas.** Se rompen solas con el paso del
    tiempo y hacen perder media hora buscando un bug que no existe.

---

## Pendientes acordados con Fa

En orden. Están conversados y sus decisiones ya tomadas.

1. **Filtrar y buscar en la app.** Hoy la app se trae los últimos 80 movimientos, así
   que un buscador sobre eso miente apenas se busque algo de hace tres meses. Hay que
   decidir: traer más movimientos o resolver la búsqueda del lado de Apps Script.

2. **Reasignar movimientos en bloque desde la app.** La pantalla "Depurar categorías"
   solo sabe UNIR muchas en una; partir una en varias no tiene herramienta. Caso real:
   la categoría `Depto` tiene 72 movimientos que son 44 de alquiler (sin detalle),
   7 de luz, 7 de gas, 8 de alarma y 6 gastos de entrada al departamento. Ojo con las
   palabras clave al partir: `Depto` tiene hoy `depto, alarma, sellado`.

### Hechos

- **Renombrar cuotas sin que se dupliquen (2026-08-23).** Antes, si Fa editaba el
  Detalle de una cuota que todavía no se había cobrado, el resumen del mes siguiente
  no la reconocía (`indiceCuotas_` comparaba el texto completo normalizado + el
  año-mes) y cargaba una fila nueva al lado. Esto pasaba tanto con las cuotas
  registradas a mano por Telegram (`crearPlanEnCuotas_`) como —el caso real de
  Fa— con las que trae de una el propio resumen de la tarjeta como "cuotas que
  vienen" (`pwa/resumen.js` arma la proyección, la app la manda con
  `origen:'proyeccion'`, `opImportar_` en `06_Api.gs` es quien las inserta). Ahora,
  cualquier fila de cuota que se crea —por cualquiera de los dos caminos— guarda en
  Notas una marca `cuota:<detalle original>|N/total` que no se toca nunca más;
  `indiceCuotas_` la usa para reconocer la cuota cuando llega el resumen real,
  aunque el Detalle ya diga otra cosa. Solo cae al Detalle actual como respaldo en
  las cuotas cargadas antes de este cambio, que no tienen la marca (a esas no
  conviene tocarles el Detalle hasta que terminen de cobrarse). Cubierto por dos
  casos nuevos en `test/test_cuotas.js`, uno por cada camino.

- **Migrar la categoría `Bastian` a persona (2026-08-22).** Las 21 filas de 2025 (20
  previstas + una compra de Temu que apareció después) quedaron con categoría real
  (Regalos, Electronica o Ropa y calzado) y persona `Bastian`. La categoría `Bastian`
  se sacó de la hoja Categorias; se agregó `Bastian` a Personas con vínculo "Hijo". La
  función que lo hizo, `migrarBastianAPersona()` en `03_Datos.gs`, queda en el código
  por si hace falta revisar el criterio, pero no tiene más uso.

---

## Privacidad

**El repositorio es público** porque GitHub Pages con cuenta gratuita solo publica
desde repos públicos. El código no tiene secretos —el token de Telegram, la API key de
Gemini y la clave de la app viven en Propiedades del Script, y la app guarda la URL y
la clave en el teléfono— pero **los datos sí son privados**.

El `.gitignore` deja afuera `test/datos.json` (cuatro años de finanzas), `pdf/`
(resúmenes de tarjeta), `excel/` (la planilla original) y `shots/` (capturas con
importes reales). **Esos archivos existen en la máquina de Fa y hacen falta para correr
las pruebas, pero no se suben nunca.** Antes de agregar un archivo nuevo al repo,
preguntarse si tiene plata adentro.

---

## Estado

- Backend: `12 · cuotas sin duplicar al renombrar`
- App: `12 · disponible y sin duplicados`
- Movimientos en la planilla: ~1030
