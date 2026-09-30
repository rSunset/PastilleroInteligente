#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// --- CONFIGURACIÓN DE RED ---
const char* ssid = "generic-wifi";
const char* password = "12345678";

// --- ENDPOINTS DE FIREBASE (Mantener el .json al final) ---
const String URL_ESTADO = "https://pastillero-inteligente-61c54-default-rtdb.firebaseio.com/estado_pastillero.json";
const String URL_NOTIFICACIONES = "https://pastillero-inteligente-61c54-default-rtdb.firebaseio.com/notificaciones_enviadas.json";

// --- PINES SEGUROS PARA TENSTAR ESP32-C3 SUPER MINI ---
// Agrupados abajo a la derecha para facilitar la soldadura
const int PIN_BOTON  = 10; // Soldar pulsador físico (y la otra pata a GND)
const int PIN_LED    = 20; // Soldar Ánodo (+) del LED
const int PIN_BUZZER = 21; // Soldar Positivo (+) del Buzzer

// --- VARIABLES DE CONTROL (No bloqueante) ---
unsigned long tiempoUltimaPeticion = 0;
const unsigned long INTERVALO_PETICION = 2000; // Leer Firebase cada 2 segundos

// Variables anti-rebote (Debounce) para el botón
unsigned long ultimoTiempoRebote = 0;
unsigned long retardoRebote = 50;
int estadoBoton = HIGH;
int ultimoEstadoBoton = HIGH;

void setup() {
  Serial.begin(115200);
  
  // Da tiempo al puerto USB CDC del C3 para inicializarse
  delay(2000); 
  
  // Configuración de pines
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_BOTON, INPUT_PULLUP); // Resistencia interna activa

  digitalWrite(PIN_LED, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  conectarWiFi();
}

void loop() {
  // 1. AUTO-RECONEXIÓN WI-FI (Blindaje contra caídas de red)
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Red perdida. Intentando reconectar...");
    conectarWiFi();
    return; // Evita hacer peticiones al aire si no hay internet
  }

  // 2. LECTURA DEL BOTÓN (Con Anti-rebote)
  int lecturaActual = digitalRead(PIN_BOTON);
  
  if (lecturaActual != ultimoEstadoBoton) {
    ultimoTiempoRebote = millis();
  }

  if ((millis() - ultimoTiempoRebote) > retardoRebote) {
    if (lecturaActual != estadoBoton) {
      estadoBoton = lecturaActual;
      
      // Si el botón cambió a LOW, lo acaban de presionar
      if (estadoBoton == LOW) {
        Serial.println("¡Botón físico presionado! Registrando toma...");
        registrarTomaEnFirebase();
      }
    }
  }
  ultimoEstadoBoton = lecturaActual;

  // 3. SONDEO A FIREBASE (No bloqueante)
  if (millis() - tiempoUltimaPeticion >= INTERVALO_PETICION) {
    tiempoUltimaPeticion = millis();
    leerEstadoFirebase();
  }
}

// --- FUNCIÓN DE CONEXIÓN WI-FI ---
void conectarWiFi() {
  Serial.print("Conectando a Wi-Fi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    // Parpadea el LED mientras intenta conectarse para dar feedback visual
    digitalWrite(PIN_LED, !digitalRead(PIN_LED)); 
    delay(300);
    Serial.print(".");
  }
  
  digitalWrite(PIN_LED, LOW); // Apaga el LED al lograr la conexión
  Serial.println("\n¡Wi-Fi Conectado!");
  Serial.print("Dirección IP: ");
  Serial.println(WiFi.localIP());
}

// --- FUNCIÓN PARA LEER ALARMAS DESDE FIREBASE ---
void leerEstadoFirebase() {
  WiFiClientSecure client;
  client.setInsecure(); // Evita validación de certificados SSL
  
  HTTPClient http;
  http.begin(client, URL_ESTADO);
  
  int httpCode = http.GET();
  
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    
    // Uso del estándar de ArduinoJson v7
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload);
    
    if (!error) {
      bool alarma_sonando = doc["alarma_sonando"] | false;
      bool buscar_pastillero = doc["buscar_pastillero"] | false;

      // Encender si hay alarma O si están usando el localizador web
      if (alarma_sonando || buscar_pastillero) {
        digitalWrite(PIN_LED, HIGH);
        digitalWrite(PIN_BUZZER, HIGH);
      } else {
        digitalWrite(PIN_LED, LOW);
        digitalWrite(PIN_BUZZER, LOW);
      }
    } else {
      Serial.print("Error al parsear el JSON: ");
      Serial.println(error.c_str());
    }
  } else {
    Serial.printf("Fallo de conexión a Firebase: %s\n", http.errorToString(httpCode).c_str());
  }
  http.end();
}

// --- FUNCIÓN PARA RESETEAR LA ALARMA AL TOMAR LA PASTILLA ---
void registrarTomaEnFirebase() {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  // 1. Apagamos actuadores de inmediato para dar respuesta táctil rápida
  digitalWrite(PIN_LED, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  // 2. Reseteamos la máquina de estados principal
  String payloadEstado = "{\"alarma_sonando\":false,\"buscar_pastillero\":false,\"segundos_sin_tomar\":0,\"nivel_alerta\":0,\"cuidador_confirmo\":false}";
  http.begin(client, URL_ESTADO);
  http.addHeader("Content-Type", "application/json");
  int code1 = http.sendRequest("PATCH", payloadEstado);
  http.end();

  // 3. Destrabamos los candados anti-spam de Telegram
  String payloadNotif = "{\"alerta_24h_telegram\":false,\"emergencia_48h_telegram\":false}";
  http.begin(client, URL_NOTIFICACIONES);
  http.addHeader("Content-Type", "application/json");
  int code2 = http.sendRequest("PATCH", payloadNotif);
  http.end();

  if (code1 == HTTP_CODE_OK && code2 == HTTP_CODE_OK) {
    Serial.println("Toma sincronizada correctamente con la Web App.");
  } else {
    Serial.println("Error de red al parchear los estados en Firebase.");
  }
}