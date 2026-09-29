/*
 * PíldHora - Plantilla de configuración de credenciales.
 *
 * USO: copia este archivo como config.js en esta misma carpeta y rellena tus datos.
 *      El archivo config.js NO se versiona (está en .gitignore).
 *
 * Cómo obtener las credenciales:
 *   1. token: escribe a @BotFather, usa /newbot (o /mybots para un bot existente)
 *      y copia el token que te devuelve.
 *   2. chatIdFallback: abre el chat de tu bot y pulsa Iniciar una vez; después
 *      consulta https://api.telegram.org/bot<TU_TOKEN>/getUpdates y busca chat.id.
 *      También puedes pedirlo a @userinfobot.
 *
 * Si este archivo no existe o el token queda vacío, la aplicación sigue funcionando
 * pero no enviará alertas de Telegram (lo registra en el historial).
 */
window.CONFIG_TELEGRAM = {
    token: "PEGA_AQUI_EL_TOKEN_DE_BOTFATHER",
    chatIdFallback: ""
};
