# Muro Interactivo

El público escanea un QR y sube fotos, vídeos, audio, PDF o documentos desde el móvil, sin registrarse. Todo aparece al momento en un panel que tú controlas: mueves, giras y redimensionas, pones texto encima, editas las fotos y eliges qué se ve.

| Dirección   | Para quién | Qué hace |
|-------------|------------|----------|
| `/`         | Público (es la del QR) | Subir archivos con nombre y mensaje opcionales |
| `/panel`    | Tú (con PIN) | Gestionar, editar y anotar |
| `/pantalla` | Proyector | Vista limpia que se actualiza sola |

## Publicar en internet (Render)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/SFkCeBo/MuroInteractivo)

1. Pulsa el botón e inicia sesión en Render (gratis, puedes entrar con GitHub).
2. Escribe el PIN que quieras para tu panel en `ADMIN_PIN` y pulsa *Deploy*.
3. En unos minutos tendrás una dirección `https://muro-interactivo-xxxx.onrender.com`. El QR la usa automáticamente; tu panel está en `/panel`.

El `render.yaml` del repositorio ya usa el plan **Starter** con un disco de 1 GB (las fotos sobreviven a reinicios). Para usarlo gratis, cambia `plan: starter` por `plan: free` y quita el disco y `DATA_DIR`. Ten en cuenta dos cosas del plan gratuito:
- **Se duerme tras 15 minutos sin visitas** y tarda unos 50 segundos en despertar. Abre `/panel` y `/pantalla` unos minutos antes de empezar y déjalas abiertas.
- **No guarda archivos al reiniciarse ni al dormirse.** Para una sesión en directo basta, pero descarga lo que quieras conservar. Si necesitas que se guarde, cambia a un plan de pago con disco (instrucciones en `render.yaml`).

## Arrancar

Necesitas [Node.js](https://nodejs.org) 18 o superior.

```bash
npm install
ADMIN_PIN=2468 npm start        # en Windows (PowerShell): $env:ADMIN_PIN=2468; npm start
```

La consola muestra las tres direcciones y el PIN. Si no fijas `ADMIN_PIN`, se genera uno al azar cada vez.

## Cómo hacer que el público llegue

**Opción A: misma wifi (lo más rápido).** Tu portátil y los móviles del público en la misma red. El QR apunta solo a la IP local de tu portátil (p. ej. `http://192.168.1.20:3000`). Algunas wifis de eventos o universidades aíslan los dispositivos entre sí; si los móviles no cargan la página, usa la opción B.

**Opción B: túnel público (funciona con datos móviles).** Deja el servidor corriendo en tu portátil y abre un túnel gratuito:

```bash
# Cloudflare (sin cuenta): https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
cloudflared tunnel --url http://localhost:3000
```

Te dará una dirección `https://algo.trycloudflare.com`. Reinicia el servidor indicándola para que el QR la use:

```bash
PUBLIC_URL=https://algo.trycloudflare.com ADMIN_PIN=2468 npm start
```

**Opción C: alojarlo en internet** (Render, Railway, Fly.io o un VPS). Es una app Node normal: comando `npm start`, variables `ADMIN_PIN` y `PUBLIC_URL`. Ojo: en los planes gratuitos el disco suele borrarse al reiniciar. Para guardar los archivos, monta un disco persistente y apunta `DATA_DIR` a él.

## En la presentación

- **Proyector:** abre `/pantalla` en el ordenador conectado al proyector y pulsa F11. O proyecta tu propio `/panel` y usa el botón *Presentar*, que oculta los controles.
- **Funciona en ordenador, tablet y móvil.** En `/pantalla`, con la pantalla en horizontal, ves el muro completo. En vertical (un móvil o una tablet de pie), las fotos se muestran a todo el ancho, una debajo de otra y con sus textos, empezando por la más reciente. El botón ⤢ la pone a pantalla completa (en iPhone, añádela a la pantalla de inicio para verla sin barras). El panel también se usa desde el móvil: la barra de herramientas va abajo, la lista se abre con el botón lateral y el muro se ve mejor con el móvil en horizontal.
- **El muro ocupa toda la pantalla**, en cualquier proporción (16:9, 16:10, 4:3), sin bandas negras. La zona central de 1920×1080 se ve siempre entera en todas las pantallas; *Cuadrícula*, *Collage* y *Ampliar* colocan las cosas dentro de ella.
- **Muro sin límite y zoom compartido:** si llegan muchas fotos, se colocan sin pisarse alrededor de las que ya hay y `/pantalla` se aleja sola para que se vean todas (*Ver todo*, activado por defecto). Desde el panel: **rueda del ratón** (o pellizco en el trackpad o con dos dedos) para acercar o alejar hacia donde apuntas —al acercar, esa zona se va centrando—; la rueda nunca cambia el tamaño de una foto, **arrastra el fondo** para desplazarte, controles **− / % / +** abajo a la izquierda, y **Enfocar** en la barra de una foto para acercarte a ella. **`/pantalla` muestra exactamente la misma vista.** *Ver todo* vuelve al ajuste automático; pulsar el porcentaje vuelve al 100 %. *Cuadrícula* y *Collage* hacen el muro más grande si hace falta.
- **Mover y agrandar fotos:** arrástralas (lo que tocas pasa al frente). Para cambiar el tamaño: la esquina inferior derecha, los botones **−** / **+** de la barra flotante o **Ampliar**, que la pone a toda pantalla. *Reducir* la devuelve a su sitio.
- **Texto encima de una foto:** selecciona la foto y pulsa *Texto*. El texto queda **anclado**: se mueve, gira y crece con la foto. También puedes arrastrar cualquier texto sobre una foto (se marca con un recuadro naranja) para anclarlo, o sacarlo fuera o pulsar *Soltar* para que vuelva a ir por libre. Si borras la foto, se borran sus textos.
- **Cambiar o borrar un texto:** doble clic sobre él (o *Editar* en la barra flotante) y escribe; Esc para terminar. *Eliminar* o Supr lo borra, y si lo dejas vacío también se borra. La barra flotante cambia color, fondo, tamaño, alineación y tipo de letra.
- **Editar foto:** doble clic → *Editar* (o botón *Editar* de la barra flotante): estilos rápidos, brillo, contraste, saturación, calidez, B/N, sepia, tono, desenfoque, girar, voltear y recortar (libre, 1:1, 4:3, 16:9, 4:5). El original se conserva y puedes volver a él.
- **Ver una foto en grande:** doble clic en una foto (o *Ver* en la lista) abre el visor y **esa foto sale también a pantalla completa en `/pantalla`**. Con ← → pasas a la siguiente y el proyector la sigue; al cerrar el visor (Esc) vuelve al muro. Si quieres mirarla solo tú, pulsa *En /pantalla* para quitarla (se recuerda para las siguientes).
- **QR grande:** mientras no haya ningún archivo en el muro, el QR se muestra a pantalla completa con el título, en el proyector y en el móvil. En cuanto llega el primer archivo pasa a su esquina, y si ocultas o borras todos vuelve a crecer. Con el botón **QR grande** del panel lo pones a pantalla completa en cualquier momento, aunque haya fotos (púlsalo otra vez para volver). El botón *QR* muestra u oculta el de la esquina.
- **Moderar:** con *Moderar* activado, lo que llega espera en la pestaña *Pendiente* hasta que lo apruebes.
- **Ocultar** (ojo) quita algo del proyector sin borrarlo; en tu panel queda semitransparente.
- **Cuadrícula / Collage** ordenan todo de golpe. *Subidas* abre o cierra la recepción.
- Atajos: Supr borra, flechas mueven (Mayús = más), rueda = zoom del muro, Mayús + esquina cambia el tamaño sin mantener la proporción, Mayús al girar ajusta de 15 en 15°.

## Descargar las fotos

En el panel, el botón **Descargar todo** baja un ZIP con todos los archivos subidos (numerados por orden de llegada y con el nombre de quien los subió), la carpeta `originales/` con la versión sin editar de las fotos que editaste y `mensajes.csv` (se abre en Excel) con autor, mensaje, hora, estado y los textos que pusiste encima. En el visor de cada foto hay también un botón **Descargar** para bajar solo esa.

## Datos y límites

- Todo se guarda en `data/` (`state.json` + `uploads/`). Si reinicias, el panel sigue igual. Para empezar de cero: botón de papelera o borra `data/`.
- Hasta 10 archivos por envío, 50 MB por archivo (`MAX_FILE_MB` para cambiarlo) y un límite anti-abuso de 600 archivos cada 10 minutos por conexión (`RATE_LIMIT`; en la wifi de un evento toda la sala suele compartir conexión).
- Las fotos grandes se reducen en el propio móvil antes de subirlas (máx. 2560 px) para ir rápido con wifi saturada.
- Las fotos HEIC de iPhone se convierten casi siempre a JPG al subirlas. Si alguna llega como HEIC, solo se verá en Safari.
- Los filtros de color del editor necesitan Chrome, Edge o Firefox. Girar, recortar y calidez funcionan en cualquier navegador.
