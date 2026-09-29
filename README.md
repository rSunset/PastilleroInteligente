# Pastillero Inteligente "PíldHora" (ESP32 + Web App)

## Endpoint de Firebase - API
URL Firebase: `https://pastillero-inteligente-61c54-default-rtdb.firebaseio.com/.json`[cite: 8]

## Estructura de estados `nivel_alerta` en Firebase
- `0`: Normal / Esperando o sonando alarma (< 24 h)[cite: 8]
- `1`: Alerta preventiva enviada al cuidador (Depende del umbral configurado)[cite: 8]
- `2`: Emergencia enviada a servicios médicos (Depende del umbral configurado sin confirmación)[cite: 8]

## TODOs del Proyecto (Rumbo a la entrega del Jueves 1 de Octubre)

- [x] **TODO 1 (Modo antiaccidentes / Protección de escritura):** Solicitar que el usuario escriba la palabra `"confirmar"` en un pop-up antes de guardar cambios de medicamentos u horarios en Firebase.[cite: 8]
- [x] **TODO 2 (Localizador acústico del ESP32):** Agregar un botón "Localizar pastillero" en la Web App que cambie `estado_pastillero/buscar_pastillero` a `true` en Firebase para hacer sonar el buzzer del ESP32 hasta encontrarlo.[cite: 8]
- [x] **TODO 3 (Directorio de Información Médica):** Agregar un botón/modal que despliegue enlaces directos a fuentes oficiales de salud y medicamentos (PLM México, MedlinePlus, Facultad de Medicina UNAM).[cite: 8]
- [x] **TODO 4 (Alertas base en Telegram):** Conectar la API de Telegram mediante peticiones HTTP para disparar alertas usando las banderas `notificaciones_enviadas` para evitar spam.[cite: 8]
- [x] **TODO 6 (Ficha clínica local y Doble Bot Personalizable):** Panel centralizado guardado en `localStorage` (cero datos sensibles en Firebase)[cite: 8] para gestionar la información del paciente, activar/desactivar independientemente el Bot 1 (Cuidador) y Bot 2 (Emergencias), configurar las horas de disparo (ej. 24h y 48h) y establecer un ciclo de insistencia (nagging) para el Bot 1.[cite: 8]
- [ ] **TODO 5 (Firmware del ESP32 en Arduino C++):** Programar `firmware_esp32/pastillero_esp32.ino` para conectarse a Wi-Fi, hacer peticiones a la API REST de Firebase (leer `alarma_sonando` y `buscar_pastillero`), encender actuadores (LED/Buzzer) y limpiar los estados de alerta mediante el botón físico.[cite: 8]
- [ ] **TODO 7 (Integración de Hardware):** Ensamblar y soldar los componentes físicos (ESP32, resistencias, LED, zumbador y push-button) asegurando la correcta lectura del circuito pull-up/pull-down del botón.
- [ ] **TODO 8 (Pruebas End-to-End):** Desactivar el `modo_demo` (1s = 1h) en la configuración, cargar el firmware al microcontrolador y realizar un ciclo de prueba real completo comprobando que el hardware reacciona al estado de Firebase y que la web se sincroniza en vivo sin recargar la página.

---

## Prompt obligatorio si usas IA para avanzar en el proyecto

Haz clic en el botón de copiar (arriba a la derecha del recuadro) y pega este texto como primer mensaje en ChatGPT, Claude o Gemini antes de pedirle código:

```text
Actúa como un desarrollador senior de sistemas embebidos y web. Estoy colaborando en un proyecto universitario llamado "PíldHora" (Pastillero Inteligente con ESP32 + Web App) cuya entrega es este jueves 1 de octubre.[cite: 8]

REGLAS ESTRICTAS DE ARQUITECTURA (PROHIBIDO SALIRSE DE AQUÍ):
1. NO propongas ni uses frameworks ni herramientas complejas (PROHIBIDO usar React, TypeScript, Node.js, pnpm, Cloudflare, bases de datos SQL, PHP, cuentas de inicio de sesión o Web Serial por USB).[cite: 8]
2. Toda la aplicación web ya está construida en 3 archivos puros: `index.html`, `styles.css` y `app.js` (Vanilla JS) con estética sobria clínica y CERO emojis.[cite: 8]
3. Tanto la Web App como el ESP32 se comunican ÚNICAMENTE por Wi-Fi haciendo peticiones HTTP (`GET` y `PATCH`) a esta base de datos Firebase Realtime Database:[cite: 8]
   `[https://pastillero-inteligente-61c54-default-rtdb.firebaseio.com/.json](https://pastillero-inteligente-61c54-default-rtdb.firebaseio.com/.json)`[cite: 8]
4. NO inventes requerimientos de hardware extra (PROHIBIDO agregar módulos GPS, GSM, pantallas adicionales o chatbots médicos con IA).[cite: 8]

LO QUE YA ESTÁ IMPLEMENTADO Y FUNCIONANDO EN LA WEB (NO ROMPER NI REESCRIBIR DESDE CERO):[cite: 8]
- Monitor en tiempo real (1s = 1h en modo demo), máquina de estados dinámica, constructor Key-Value de pastillas y optimizador de horarios Z_24.[cite: 8]
- Modales de UI completados: "Confirmar" por escritura para prevenir accidentes, Enlaces médicos (PLM, UNAM) y Panel de Ajustes.[cite: 8]
- Configuración guardada en `localStorage` para proteger los datos médicos del paciente y los Tokens de la API de Telegram.
- Doble Bot de Telegram con validación de red HTTP y candados anti-spam (`alerta_24h_telegram` y `emergencia_48h_telegram`) controlados matemáticamente por aritmética modular para insistencia (nagging).[cite: 8]
- Sincronización multi-dispositivo en vivo: La web detecta cambios remotos y se recarga sola evaluando el JSON de Firebase.

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
}[cite: 8]

EN QUÉ SÍ DEBES AYUDARME Y ENFOCAR MIS RECURSOS (SOLO FALTA UNA TAREA PRINCIPAL):
- Tarea Única (ESP32 en Arduino C++): Programar el firmware para el ESP32.[cite: 8] 
  1) Conectar a la red Wi-Fi.
  2) En el `loop()`, hacer `GET` periódico a Firebase para leer `alarma_sonando` y `buscar_pastillero`.
  3) Encender los actuadores (LED y Buzzer) si alguna de esas dos variables es `true`.
  4) Al presionar el botón físico del pastillero, hacer un `PATCH` a `/estado_pastillero.json` mandando `alarma_sonando: false`, `buscar_pastillero: false`, `segundos_sin_tomar: 0`, `nivel_alerta: 0` y `cuidador_confirmo: false`.[cite: 8] También hacer un `PATCH` a `/notificaciones_enviadas.json` reiniciando ambas banderas de Telegram a `false`.[cite: 8]

Si te pido algo que viole estas reglas o que nos haga perder tiempo antes de la entrega del jueves, adviérteme y redirígeme a la solución en C++. Pídeme los detalles de los pines que estoy utilizando si comenzamos a escribir el código de hardware.[cite: 8]