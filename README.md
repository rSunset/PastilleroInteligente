# Pastillero Inteligente (ESP32 + Web App)

## Endpoint de firebase - API
URL firebase: `https://pastillero-inteligente-61c54-default-rtdb.firebaseio.com/.json`

## Estructura de estados `nivel_alerta` en firebase
- `0`: Normal / Esperando o sonando alarma (< 24h)
- `1`: Alerta 24h enviada al cuidador (24h a 47h sin toma)
- `2`: Emergencia 48h enviada a servicios médicos (>= 48h sin confirmación)
