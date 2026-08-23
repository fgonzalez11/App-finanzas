# Finanzas Fa — instalación

Tiempo de armado: **20–25 minutos**, una sola vez. Después no tocás nada más.

No hace falta saber programar: es copiar y pegar. Tampoco hay que pagar nada
ni mantener ningún servidor.

---

## Qué es cada pieza

| Pieza | Qué hace | Dónde vive |
|---|---|---|
| **Google Sheet** | La base de datos. Es tu planilla de siempre, con tus 1.019 movimientos ya adentro. | Tu Google Drive |
| **Apps Script** | El cerebro: recibe los mensajes de Telegram, interpreta el texto y escribe en la planilla. | Pegado a la planilla |
| **Bot de Telegram** | La carga rápida: le escribís, le mandás un audio o la foto de un ticket. | Telegram |
| **App (PWA)** | Ícono en la pantalla de inicio del iPhone: teclado numérico, saldos, resumen del mes e importador de resúmenes de tarjeta. | Donde la publiques |

---

## El modelo de datos

Es el tuyo, no uno inventado. Lo único que cambió:

| Antes | Ahora | Por qué |
|---|---|---|
| `04. Noe` | `04. Cuota alimentaria` + persona **Noe** | Es un gasto real, y además querés ver el acumulado con ella |
| `05. Nikin` | `05. Préstamos` + persona **Nikin** | Prestar plata **no es gasto**: sale pero vuelve. Sale del total del mes y pasa a ser un saldo |
| Categoría `Mes` | `Cuota alimentaria` | Que se entienda sin tener que acordarse |
| Sin columna de persona | Columna **Persona** | Para poder ver el saldo con cada uno |
| Un movimiento en USD mezclado con los pesos | Columna **Moneda** | Ese U$S 5.000 del 10/12/2024 estaba sumando como si fueran 5.000 pesos |

Los importes siguen **con signo**: los ingresos suman, los gastos restan. La hoja
`Tipos` decide qué cuenta como gasto y qué no — podés cambiarlo sin tocar código.

---

## Paso 1 — Subir la planilla (3 min)

1. Entrá a [drive.google.com](https://drive.google.com) → **Nuevo → Subir archivo**
   y subí `Finanzas Fa.xlsx`.
2. Doble clic en el archivo → **Abrir con → Google Sheets**.
3. Menú **Archivo → Guardar como Hojas de cálculo de Google**. Esto crea la
   versión nativa, que es la que vamos a usar. El `.xlsx` original podés borrarlo.

Vas a ver cuatro hojas: **Movimientos**, **Tipos**, **Categorias** y **Personas**.

---

## Paso 2 — El código (10 min)

1. En la planilla: **Extensiones → Apps Script**. Se abre el editor en otra pestaña.
2. Borrá todo lo que diga `function myFunction()`.
3. Creá **un archivo por cada `.gs` de la carpeta `apps-script/`** (botón `+` →
   *Secuencia de comandos*) y pegá el contenido de cada uno:

   ```
   00_Config     01_Setup     02_Parser     03_Datos
   04_IA         05_Telegram  06_Api
   ```

   > El archivo que venía por defecto renombralo a `00_Config` y usalo.

4. Guardá (💾) y volvé a la planilla. **Recargá la página.**
5. Aparece el menú **💸 Finanzas**. Andá a **1. Preparar planilla**.
   - Google te pide permisos. Aceptá.
   - En *"Google no verificó esta aplicación"* → **Configuración avanzada →
     Ir a Finanzas (no seguro)**. Es tu propio código: esa advertencia sale
     porque el script no está publicado en la tienda de Google.
6. Esto da formato, arma las listas desplegables y crea la hoja **Resumen**.
   **No toca tus datos.**

---

## Paso 3 — Publicar como aplicación web (3 min)

En el editor de Apps Script:

1. **Implementar** (arriba a la derecha) → **Nueva implementación**.
2. Engranaje ⚙ → **Aplicación web**.
3. Completá:
   - **Ejecutar como:** *Yo*
   - **Quién tiene acceso:** *Cualquier usuario* ← imprescindible, sin esto
     Telegram no puede avisarle nada al script.
4. **Implementar** → copiá la **URL**, que termina en `/exec`. La vas a usar dos veces.

> Cada vez que cambies el código: **Implementar → Gestionar implementaciones →
> ✏️ → Versión: Nueva → Implementar**. Si no, sigue corriendo la versión vieja.

---

## Paso 4 — El bot de Telegram (5 min)

1. En Telegram buscá **@BotFather** y mandale `/newbot`.
2. Nombre: el que quieras. Usuario: tiene que terminar en `bot`.
3. Copiá el **token** que te devuelve.
4. En la planilla: **💸 Finanzas → 2. Configurar token de Telegram**.
5. Abrí el chat con tu bot y mandale cualquier cosa (`hola`).
6. **💸 Finanzas → 3. Autorizar mi chat de Telegram**. Esto hace que el bot
   **solo te responda a vos**.
7. **💸 Finanzas → 6. Conectar el bot** y pegá la URL `/exec` del paso 3.

Probá: `45230 la anonima con debito`

---

## Paso 5 — Audios y fotos de tickets (2 min, opcional)

1. Creá una **API key** gratis en [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. **💸 Finanzas → 4. Configurar API key de Gemini**.

Probá mandarle un audio: *"gasté cuarenta y cinco mil en la anónima"*.

---

## Paso 6 — La app en el iPhone (5 min)

1. **💸 Finanzas → 5. Generar clave de la app web**. Copiá lo que te muestra.
2. Publicá `index.html` y `sw.js` en algún lado con `https`:
   - **GitHub Pages**: repo nuevo → subís los dos archivos →
     *Settings → Pages → Deploy from a branch → main / (root)*.
   - **O sin cuenta**: arrastrá la carpeta `pwa/` a
     [app.netlify.com/drop](https://app.netlify.com/drop).
3. En el iPhone, abrí la URL **en Safari** (el "Agregar a inicio" solo anda bien
   desde Safari) → **􀈂 Compartir → Agregar a pantalla de inicio**.
4. Abrí el ícono, pegá la URL `/exec` y la clave, **Guardar y probar**.

---

## Cómo se usa

### Por Telegram

Escribile como se te ocurra:

```
45230 la anonima con debito
ayer 32000 axion
12/08 cuota noe 1.271.333
cobré el sueldo 6.720.000
le presté 500k a nikin
u$s 40 claude
```

**En cuotas** (para lo que **no** va con la tarjeta — lo de la tarjeta lo trae el resumen):

```
sommier 480000 en 6 cuotas     → 6 de 80.000
6 cuotas de 80000 sommier      → lo mismo, dicho al revés
universidad 850000 en 10 cuotas
```

Crea **una fila por mes**, no una sola por el total: la primera con la fecha que
le des (hoy por defecto) y las demás el mismo día de cada mes. El detalle queda
numerado (`sommier 1/6`, `sommier 2/6`…) y las que todavía no vencieron aparecen
en **Comprometido a futuro**. Si el total no se divide justo, el resto va en la
última cuota, así la suma cierra exacta.

El botón **🗑 Borrar las N** borra el plan entero, y si le corregís la categoría
se la corrige a las N de una.

> Ojo: decir "cuotas" ya no marca el medio como Crédito. Si fue con tarjeta,
> agregá `con tarjeta`.

- Ya conoce tu vocabulario: *angelelli*, *curupayti*, *la anónima*, *dexter*,
  *seguro ka*, *uni juli*, *periodo 2a 2b*… salieron de tus propias observaciones
  de los últimos cuatro años.
- Entiende `k` / `mil` / `luca` = ×1000 y `palo` = ×1.000.000.
- Entiende `hoy`, `ayer`, `anteayer`, `el viernes`, `12/08`.
- Si nombrás a **Noe** o **Nikin**, completa la persona solo.
- **Nota de voz** y **foto de ticket** también funcionan.

Debajo de cada confirmación tenés **✏️ Categoría** y **🗑 Borrar**.

> Si le corregís una categoría, guarda esa palabra en la hoja `Categorias` y la
> próxima vez acierta. Se afina con el uso.

**Comandos**

| | |
|---|---|
| `/mes` | ingresos, gastos y ahorro del mes |
| `/saldos` | cuánto va con Noe y con Nikin |
| `/ano` | ahorro mes a mes |
| `/hoy` | lo de hoy |
| `/ultimos` | los últimos 10 |
| `/deshacer` | borra el último |
| `/planilla` | link a la planilla |

### Por la app

- **Cargar** — tecleás el monto y tocás una categoría. Dos toques y está.
  El chip **Gasto/Ingreso** cambia el signo; con las categorías de cobro se pone solo.
  Manteniendo apretado **⌫** borrás el monto entero.
  Si no hay señal, queda en cola y se sincroniza cuando vuelve.
- **Últimos** — primero lo que ya pasó; abajo, atenuado, lo que dejaste
  comprometido a futuro. Tocá cualquiera para editarlo.
- **Mes** — ahorro arriba de todo, gastado, comprometido, promedio diario,
  proyección, ahorro mes a mes, saldos con personas y el desglose.
- **Más → Importar resumen de tarjeta** — elegís el **PDF** del resumen.

### El lector de resúmenes

Se lee **en el teléfono**: el PDF no sale del celular, a la planilla viajan solo
las líneas ya extraídas.

De tu resumen saca el cierre y el vencimiento (no los adivina, los dice el PDF),
cada consumo con su titular, los consumos en dólares por separado, los impuestos
y percepciones, y las cuotas con su número (`C.04/06`).

**Todo entra con la fecha de vencimiento**, que es el día en que la plata sale de
tu cuenta. Por eso tu agosto muestra lo que compraste en julio: así lo elegiste,
y es lo que hace que el ahorro del mes cierre con tu cuenta bancaria.

**Las cuotas se proyectan solas.** De cada `C.04/06` calcula las que faltan y las
carga como comprometido, con comercio y monto. Antes de mostrártelas compara ese
cálculo contra la tabla "cuotas a vencer" que imprime el banco: si no cuadran, te
avisa en vez de cargar números inventados.

**Y no se duplican.** Cuando la cuota proyectada llegue de verdad en el próximo
resumen, no se carga otra vez: se confirma la que estaba y se le pisa el importe
con el del banco. Lo que cargaste antes es un pronóstico, lo que trae el resumen
es el hecho, y el hecho manda aunque los centavos no coincidan.

**Aprende de tus correcciones.** Cada categoría que elegís a mano en la revisión
guarda el comercio en la hoja `Categorias`. Corregís `PEDIDOSYA` una vez y no te
lo vuelve a preguntar nunca.

Si preferís, abajo de todo sigue estando la opción de pegar un CSV a mano.

---

## Lo que podés cambiar sin tocar código

**Hoja `Categorias`**

- Agregar una categoría: fila nueva con nombre, tipo, emoji y palabras clave.
- Que reconozca un comercio nuevo: agregalo a `PalabrasClave` de la categoría
  que corresponda.

**Hoja `Tipos`**

- `CuentaEnGasto` decide si ese tipo entra en "cuánto gasté este mes".
  Hoy los préstamos están en **NO** y la cuota alimentaria en **SI**.
  Si algún día querés que los préstamos cuenten, cambiás esa celda y listo.

**Hoja `Personas`**

- Agregá una fila para llevar la cuenta con alguien más.

Después, en la app: **Más → 🔄 Recargar categorías**.

---

## Si algo no anda

| Síntoma | Qué pasa |
|---|---|
| El bot no contesta | La implementación no quedó con acceso *"Cualquier usuario"*, o cambiaste el código sin crear una **versión nueva**. |
| "No pude conectar" en la app | La URL tiene que terminar en `/exec` (no en `/dev`). Revisá también la clave. |
| El bot dice "Este bot es privado" | Falta el paso **3. Autorizar mi chat**. |
| Los audios no funcionan | Falta la API key de Gemini. |
| Cambié el código y sigue igual | **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva**. |
| El bot cargó el mismo gasto varias veces | **💸 Finanzas → Limpiar movimientos duplicados**. Te muestra qué va a borrar antes de hacerlo. |
| Quiero ver qué falló | Editor de Apps Script, panel **Ejecuciones**. |

Estado general: **💸 Finanzas → Ver estado de la configuración**.
