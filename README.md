# TK61 Luces

Control de luces RGB, animaciones y juegos para el teclado **Tezarre TK61** (60 %, 61 teclas) en Windows.

El software oficial del teclado ya no se consigue, así que esta app habla directamente con él. No instala ningún
driver ni pide permisos de administrador: usa el controlador HID que Windows ya trae.

## Qué hace

- **Efectos del teclado**: estático, respiración, ola, neón, serpiente y tres que reaccionan al teclear, con colores,
  brillo, velocidad y dirección.
- **Color por tecla**: pinta las 61 teclas con pincel, degradados y rellenos rápidos; lo ves en el teclado mientras pintas.
- **Animaciones y juegos en vivo**: Pong, Pelota, Arkanoid, Invasores, Snake, ecualizador de música, fuegos
  artificiales, lluvia digital, fuego, plasma, juego de la vida, monitor de CPU y más. Todas tienen la opción
  «RGB» para que los colores vayan cambiando solos.
- **Perfiles**: guarda cualquier combinación y cámbiala con un clic, desde la bandeja del sistema o con atajos de teclado.
- **Se actualiza sola** desde las publicaciones de este repositorio.

## Instalar

Descarga `TK61-Luces-Setup-x.y.z.exe` desde [Releases](https://github.com/doguer27/tk61-luces/releases/latest) y ejecútalo.
Se instala solo para tu usuario.

El instalador no está firmado con un certificado de pago, así que la primera vez Windows SmartScreen puede mostrar
«Windows protegió su PC»: pulsa **Más información → Ejecutar de todas formas**. El código completo está en este
repositorio y el instalador se genera a partir de él.

## Compatibilidad

Probado con un Tezarre TK61 que se identifica por USB como `0416:B23C`, firmware `TK61BIRRGB V1.04.00`.
No sirve para «cualquier teclado RGB»: cada fabricante de chips habla su propio idioma. La app solo reconoce teclados
que se identifican como `0416:B23C` (chip Winbond/Nuvoton con firmware Witmod). Con ese mismo identificador se han
visto, además del TK61, el Pulsar PCMK, los KT108/KT87 y los Hator Rockfall/Skyfall; deberían aceptar los efectos,
pero no están probados aquí. El dibujo y las animaciones están pensados para 61 teclas: en un teclado más grande las
teclas extra se quedan apagadas.

La primera vez que abres la app te pide comprobar que cada tecla se enciende donde debe y, si no coincide, te guía
para calibrarla (también en **Ajustes → Teclado**).

Si la app dice «No responde»: cambia el teclado (o su hub) a otro puerto USB del PC. En algunos controladores USB
el teclado se puede usar para escribir pero no recibe órdenes.

## Cómo cuida el teclado

El teclado guarda en su memoria flash los colores por tecla, y esa memoria tiene un número limitado de escrituras.
Midiendo los tiempos de respuesta se ve que solo graba cuando recibe el último de los 8 paquetes de colores, que en
un teclado de 61 teclas no lleva ninguna tecla. Las animaciones envían únicamente los otros 7, así que pueden correr
todo el día sin gastar la memoria. Solo «Guardar en el teclado» y los perfiles de color fijo escriben en ella.

## Privacidad y seguridad

- No recoge ni envía datos. La única conexión a internet es la consulta de versiones nuevas a GitHub.
- El ecualizador de música analiza el sonido del PC en el momento, solo mientras esa animación está puesta; no graba ni guarda nada.
- La ventana corre aislada (sandbox, sin acceso a Node), no carga contenido de internet y el ejecutable tiene
  desactivados los modos de depuración y de ejecución de código externo de Electron.

## Desarrollo

```
npm install
npm start          # abre la app en modo desarrollo
npm test           # comprueba el protocolo y las animaciones sin tocar el teclado
npm run dist       # genera el instalador en dist/
```

- `app/protocolo.js`: paquetes HID y forma del teclado.
- `app/animaciones.js`: animaciones y juegos (funciones puras: tiempo → color de cada tecla).
- `app/main.js`: proceso principal (teclado, motor de animaciones, bandeja, actualizaciones).
- `app/index.html`: interfaz.

## Créditos y licencia

El protocolo se conoce gracias a la ingeniería inversa de Daniel Gibson para el controlador *Winbond Gaming Keyboard*
de [OpenRGB](https://openrgb.org). Este proyecto no está afiliado a Tezarre, Witmod ni Nuvoton.

Licencia: [GPL-2.0-or-later](LICENSE).
