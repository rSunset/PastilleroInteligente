# Pastillero Inteligente (ESP32 + Web App)

## Endpoint de firebase - API
URL firebase: `https://pastillero-inteligente-61c54-default-rtdb.firebaseio.com/.json`

## Estructura de estados `nivel_alerta` en firebase
- `0`: Normal / Esperando o sonando alarma (< 24h)
- `1`: Alerta 24h enviada al cuidador (24h a 47h sin toma)
- `2`: Emergencia 48h enviada a servicios médicos (>= 48h sin confirmación)


## TODOs Pendientes (Rumbo a la entrega del Jueves 1 de Octubre)

- [x] **TODO 1 (Modo antiaccidentes / Protección de escritura):** Solicitar que el usuario escriba la palabra `"confirmar"` en un recuadro antes de permitir agregar/quitar medicamentos o guardar cambios de horario en Firebase.
- [ ] **TODO 2 (Localizador acústico del ESP32):** Agregar un botón "Localizar pastillero" en la Web App que cambie `estado_pastillero/buscar_pastillero` a `true` en Firebase para hacer sonar el buzzer del ESP32 hasta encontrarlo.
- [ ] **TODO 3 (Directorio de Información Médica):** Agregar un botón/panel que despliegue enlaces directos a fuentes oficiales de salud y medicamentos (PLM México, MedlinePlus, Facultad de Medicina UNAM).
- [ ] **TODO 4 (Alertas en Telegram):** Conectar un Bot de Telegram mediante peticiones HTTP para enviar la alerta de 24 h al cuidador (Estado 1) y la alerta de 48 h a emergencias (Estado 2), usando las banderas `notificaciones_enviadas` para evitar spam.
- [ ] **TODO 5 (Firmware del ESP32):** Programar `firmware_esp32/pastillero_esp32.ino` en C++ para leer/escribir el JSON de Firebase por Wi-Fi, activar LED/Buzzer y leer el botón físico de toma de pastilla.

## Si van a hacer el trabajo con IA pegenle el siguiente comando al iniciarla para que tenga el contexto de lo que estamos haciendo.

Haz clic en el botón de copiar y pega este texto como primer mensaje en ChatGPT, Claude o Gemini antes de pedirle código:

```text
Actúa como un desarrollador senior de sistemas embebidos y web. Estoy colaborando en un proyecto universitario llamado "PíldHora" (Pastillero Inteligente con ESP32 + Web App) cuya entrega es este jueves 1 de octubre.

REGLAS ESTRICTAS DE ARQUITECTURA (PROHIBIDO SALIRSE DE AQUÍ):
1. NO propongas ni uses frameworks ni herramientas complejas (PROHIBIDO usar React, TypeScript, Node.js, pnpm, Cloudflare, bases de datos SQL, PHP, cuentas de inicio de sesión o Web Serial por USB).
2. Toda la aplicación web ya está construida en 3 archivos puros: `index.html`, `styles.css` y `app.js` (Vanilla JS) con estética sobria clínica y CERO emojis.
3. Tanto la Web App como el ESP32 se comunican ÚNICAMENTE por Wi-Fi haciendo peticiones HTTP (`GET` y `PATCH`) a esta base de datos Firebase Realtime Database:
   `[https://pastillero-inteligente-61c54-default-rtdb.firebaseio.com/.json](https://pastillero-inteligente-61c54-default-rtdb.firebaseio.com/.json)`
4. NO inventes requerimientos de hardware extra (PROHIBIDO agregar módulos GPS, GSM, pantallas adicionales o chatbots médicos con IA).

CONTRATO DE DATOS EN FIREBASE (NO MODIFICAR NOMBRES DE VARIABLES):
{
  "configuracion": {
    "modo_demo": true,
    "segundos_por_hora_demo": 1,
    "hora_alarma": "07:00",
    "hora_inicio": "07:00",
    "tratamientos": { "Paracetamol": 8 },
    "horarios_dia": ["07:00", "15:00", "23:00"]
  },
  "estado_pastillero": {
    "alarma_sonando": false,
    "buscar_pastillero": false,
    "segundos_sin_tomar": 0,
    "nivel_alerta": 0,
    "cuidador_confirmo": false
  },
  "notificaciones_enviadas": {
    "alerta_24h_telegram": false,
    "emergencia_48h_telegram": false
  }
}

EN QUÉ SÍ DEBES AYUDARME Y ENFOCAR MIS RECURSOS:
Solo nos faltan estas tareas puntuales:
- Tarea A (ESP32 en Arduino C++): Conectar el ESP32 a Wi-Fi, hacer `GET` a Firebase para leer `alarma_sonando`, `buscar_pastillero` y `hora_alarma`; encender un LED y un Buzzer cuando corresponda; y cuando se presione el botón físico del pastillero, hacer un `PATCH` a `/estado_pastillero.json` poniendo `alarma_sonando: false`, `segundos_sin_tomar: 0`, `nivel_alerta: 0` y `cuidador_confirmo: false`.
- Tarea B (Telegram): Hacer peticiones HTTP a la API de un Bot de Telegram cuando `nivel_alerta` cambie a `1` (24 horas sin toma -> avisar al cuidador) o a `2` (48 horas sin confirmación -> avisar a emergencias), actualizando `notificaciones_enviadas` para enviar solo un mensaje por estado.
- Tarea C (Micro-mejoras aprobadas en la Web): 1) Un input que pida escribir la palabra "confirmar" antes de modificar horarios/pastillas, 2) Un botón que active `buscar_pastillero: true` para hacer sonar el ESP32 si se pierde, y 3) Un botón con links estáticos a páginas oficiales de información de medicamentos.

Si te pido algo que viole estas reglas o que nos haga perder tiempo antes del jueves, adviérteme y redirígeme a una solución simple compatible con el JSON de arriba. Pregúntame en cuál de las tareas (A, B o C) voy a trabajar ahora.
```
