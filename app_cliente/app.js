const FIREBASE_URL = "https://pastillero-inteligente-61c54-default-rtdb.firebaseio.com";
const $ = (id) => document.getElementById(id);

let ultimaHoraAviso = -1; // Candado local anti-spam para la repetición

// --- TODO 6 EXTRA: BLINDANDO EL LOCALSTORAGE ---
function obtenerConfigDefecto() {
    return {
        paciente: { nombre: "", sangre: "", alergias: "", direccion: "" },
        bot1: { activo: true, horas: 24, repeticion: 2, token: "", chat: "" },
        bot2: { activo: true, horas: 48, token: "", chat: "" }
    };
}

let configLocal;
try {
    configLocal = JSON.parse(localStorage.getItem("pildhora_config")) || obtenerConfigDefecto();
    if (!configLocal.bot1 || !configLocal.paciente) configLocal = obtenerConfigDefecto();
} catch {
    configLocal = obtenerConfigDefecto();
}

let simuladorActivo = false;
let procesandoTick = false;
let esquemaInicialCargado = false;
let buscandoPastillero = false;
let ultimoNivel = null;
let ultimaAlarma = null;
let tratamientosMap = { "Paracetamol": 8 };

const PALABRA_CONFIRMACION = "confirmar";

const inputHora = $("inputHora");
const inputNombre = $("inputNombrePastilla");
const inputIntervalo = $("inputIntervaloPastilla");
const contenedorIntervalos = $("contenedorIntervalos");
const listaHorariosDia = $("listaHorariosDia");
const listaEventos = $("listaEventos");
const btnConfirmar = $("btnConfirmarCuidador");
const btnBuscarPastillero = $("btnBuscarPastillero");
const btnToggleReloj = $("btnToggleReloj");

const modalConfirmar = $("modalConfirmar");
const inputConfirmar = $("inputConfirmar");
const btnAceptarModal = $("btnAceptarModal");
const modalSalud = $("modalSalud");
const listaLinksPastillas = $("listaLinksPastillas");
const modalAjustes = $("modalAjustes");

// --- DS PARCHE 5: HELPER ROBUSTO PARA FIREBASE ---
async function patchFirebase(nodo, datos) {
    try {
        const res = await fetch(`${FIREBASE_URL}/${nodo}.json`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(datos)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return true;
    } catch (e) {
        registrarEvento(`Error de red al actualizar base de datos (${nodo}).`, "danger");
        return false;
    }
}

async function enviarTelegram(token, chatId, texto) {
    if (!token || !chatId) return false;
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: texto })
        });
        return res.ok; // DS Parche 3: Requerimos saber si el envío fue exitoso
    } catch {
        return false;
    }
}

function registrarEvento(mensaje, tipo = "normal") {
    const ahora = new Date().toLocaleTimeString("es-MX", { hour12: false });
    const item = document.createElement("div");
    item.className = `log-entry log-${tipo}`;
    item.innerHTML = `<span class="log-time">[${ahora}]</span><span>${mensaje}</span>`;
    listaEventos.prepend(item);
}

// --- DS PARCHE 4: ARREGLO DE EMERGENCIA SILENCIADA ---
function calcularNivelAlerta(segundos, cuidadorConfirmo) {
    // 1. La emergencia de 48h es implacable. Si llegan a 48h y no hay toma física, dispara SIEMPRE.
    if (configLocal.bot2.activo && segundos >= (configLocal.bot2.horas * 1)) return 2;

    // 2. Si el cuidador confirmó, se silencia el aviso recurrente de 24h.
    if (cuidadorConfirmo) return 0;

    // 3. Si superó 24h y no hay confirmación, Estado 1.
    if (configLocal.bot1.activo && segundos >= (configLocal.bot1.horas * 1)) return 1;

    return 0;
}

// --- MODAL DE AJUSTES Y PACIENTE ---

function cargarAjustesUI() {
    $("cfgNombre").value = configLocal.paciente.nombre;
    $("cfgSangre").value = configLocal.paciente.sangre;
    $("cfgAlergias").value = configLocal.paciente.alergias;
    $("cfgDireccion").value = configLocal.paciente.direccion;

    $("cfgBot1Activo").checked = configLocal.bot1.activo;
    $("cfgBot1Horas").value = configLocal.bot1.horas;
    $("cfgBot1Repeticion").value = configLocal.bot1.repeticion;
    $("cfgBot1Token").value = configLocal.bot1.token;
    $("cfgBot1Chat").value = configLocal.bot1.chat;

    $("cfgBot2Activo").checked = configLocal.bot2.activo;
    $("cfgBot2Horas").value = configLocal.bot2.horas;
    $("cfgBot2Token").value = configLocal.bot2.token;
    $("cfgBot2Chat").value = configLocal.bot2.chat;
}

$("btnAjustes").addEventListener("click", () => {
    cargarAjustesUI();
    modalAjustes.classList.remove("hidden");
});

$("btnCerrarAjustes").addEventListener("click", () => modalAjustes.classList.add("hidden"));

$("btnGuardarAjustes").addEventListener("click", () => {
    configLocal.paciente = {
        nombre: $("cfgNombre").value.trim(),
        sangre: $("cfgSangre").value.trim(),
        alergias: $("cfgAlergias").value.trim(),
        direccion: $("cfgDireccion").value.trim()
    };
    configLocal.bot1 = {
        activo: $("cfgBot1Activo").checked,
        horas: parseInt($("cfgBot1Horas").value) || 24,
        repeticion: Math.max(1, parseInt($("cfgBot1Repeticion").value) || 1),
        token: $("cfgBot1Token").value.trim(),
        chat: $("cfgBot1Chat").value.trim()
    };
    configLocal.bot2 = {
        activo: $("cfgBot2Activo").checked,
        horas: parseInt($("cfgBot2Horas").value) || 48,
        token: $("cfgBot2Token").value.trim(),
        chat: $("cfgBot2Chat").value.trim()
    };

    localStorage.setItem("pildhora_config", JSON.stringify(configLocal));
    modalAjustes.classList.add("hidden");
    registrarEvento("Ajustes locales del sistema y paciente guardados.", "ok");
    cicloPrincipal();
});

// --- MEDICAMENTOS (KEY-VALUE) Y OPTIMIZADOR Z_24 ---

function calcularTomasDelDia(horaInicioStr, mapa) {
    const [hBase, mBase] = (horaInicioStr || "07:00").split(":").map(Number);
    const agenda = {};

    Object.entries(mapa).forEach(([nombre, intervalo]) => {
        const paso = Math.max(1, Math.min(24, Number(intervalo) || 8));
        for (let h = 0; h < 24; h += paso) {
            const hora = `${String((hBase + h) % 24).padStart(2, "0")}:${String(mBase).padStart(2, "0")}`;
            (agenda[hora] = agenda[hora] || []).push(nombre);
        }
    });
    return Object.keys(agenda).sort().map((hora) => ({ hora, pastillas: agenda[hora] }));
}

function actualizarVistaPreviaHorarios() {
    const tomas = calcularTomasDelDia(inputHora.value, tratamientosMap);
    listaHorariosDia.innerHTML = "";
    tomas.forEach(({ hora, pastillas }) => {
        const hNum = parseInt(hora.split(":")[0], 10);
        const chip = document.createElement("span");
        chip.className = hNum >= 1 && hNum <= 5 ? "time-chip madrugada" : "time-chip";
        chip.innerText = `${hora} (${pastillas.join(", ")})`;
        listaHorariosDia.appendChild(chip);
    });
}

function renderizarListaPastillas() {
    contenedorIntervalos.innerHTML = "";
    const entradas = Object.entries(tratamientosMap);

    if (!entradas.length) {
        contenedorIntervalos.innerHTML = `<div class="helper-text">Sin medicamentos activos.</div>`;
        listaHorariosDia.innerHTML = "";
        return;
    }

    entradas.forEach(([nombre, intervalo]) => {
        const fila = document.createElement("div");
        fila.className = "interval-item";
        fila.innerHTML = `<div><strong>${nombre}</strong><span class="pill-meta">Cada ${intervalo} h</span></div><button class="btn-remove">Quitar</button>`;
        fila.querySelector("button").addEventListener("click", () => {
            delete tratamientosMap[nombre];
            renderizarListaPastillas();
        });
        contenedorIntervalos.appendChild(fila);
    });
    actualizarVistaPreviaHorarios();
}

$("btnAgregarPastilla").addEventListener("click", () => {
    const nombre = inputNombre.value.trim();
    const intervalo = parseInt(inputIntervalo.value, 10);
    if (!nombre || isNaN(intervalo) || intervalo < 1 || intervalo > 24) return;

    tratamientosMap[nombre] = intervalo;
    inputNombre.value = "";
    renderizarListaPastillas();
});

$("btnRecomendar").addEventListener("click", () => {
    if (!Object.keys(tratamientosMap).length) return;
    let mejorHora = "07:00", menorCosto = Infinity, maxHorasSueno = 0;

    for (let hCandidata = 0; hCandidata < 24; hCandidata++) {
        const candidatoStr = `${String(hCandidata).padStart(2, "0")}:00`;
        const tomas = calcularTomasDelDia(candidatoStr, tratamientosMap);
        const horasNum = tomas.map((t) => parseInt(t.hora.split(":")[0], 10));

        let costo = Math.abs(hCandidata - 7) * 2;
        tomas.forEach(({ hora, pastillas }) => {
            const h = parseInt(hora.split(":")[0], 10);
            const peso = pastillas.length;
            if (h >= 2 && h <= 4) costo += 150 * peso;
            else if (h === 1 || h === 5) costo += 90 * peso;
            else if (h === 0 || h === 6 || h === 23) costo += 20 * peso;
        });

        let mayorVentana = horasNum.length > 1 ? 0 : 24;
        for (let i = 0; i < horasNum.length; i++) {
            const dist = (horasNum[(i + 1) % horasNum.length] - horasNum[i] + 24) % 24;
            if (dist > mayorVentana) mayorVentana = dist;
        }

        if (costo < menorCosto) { menorCosto = costo; mejorHora = candidatoStr; maxHorasSueno = mayorVentana; }
    }

    inputHora.value = mejorHora;
    actualizarVistaPreviaHorarios();
    registrarEvento(`Inicio óptimo: ${mejorHora} (ventana máx. sin alarmas: ${maxHorasSueno} h).`, "ok");
});

inputHora.addEventListener("input", actualizarVistaPreviaHorarios);

// --- POP-UP DE CONFIRMACIÓN AL GUARDAR ---

function cerrarModalConfirmar() {
    modalConfirmar.classList.add("hidden");
    inputConfirmar.value = "";
    btnAceptarModal.disabled = true;
}

$("btnGuardarHora").addEventListener("click", () => {
    modalConfirmar.classList.remove("hidden");
    inputConfirmar.value = "";
    btnAceptarModal.disabled = true;
    inputConfirmar.focus();
});

$("btnCancelarModal").addEventListener("click", cerrarModalConfirmar);

inputConfirmar.addEventListener("input", (e) => {
    btnAceptarModal.disabled = e.target.value.trim().toLowerCase() !== PALABRA_CONFIRMACION;
});

inputConfirmar.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !btnAceptarModal.disabled) btnAceptarModal.click();
    if (e.key === "Escape") cerrarModalConfirmar();
});

btnAceptarModal.addEventListener("click", async () => {
    if (inputConfirmar.value.trim().toLowerCase() !== PALABRA_CONFIRMACION) return;

    const horaInicio = inputHora.value;
    const horariosDia = calcularTomasDelDia(horaInicio, tratamientosMap).map((t) => t.hora);

    const exito = await patchFirebase("configuracion", {
        hora_alarma: horaInicio,
        hora_inicio: horaInicio,
        tratamientos: tratamientosMap,
        horarios_dia: horariosDia
    });

    if (exito) {
        registrarEvento(`Esquema confirmado y guardado en la red (${Object.keys(tratamientosMap).length} med).`, "ok");
    }
    cerrarModalConfirmar();
    cicloPrincipal();
});

// --- LOCALIZADOR ACÚSTICO ---
btnBuscarPastillero.addEventListener("click", async () => {
    const nuevoEstado = !buscandoPastillero;
    await patchFirebase("estado_pastillero", { buscar_pastillero: nuevoEstado });
    registrarEvento(nuevoEstado ? "Localizador activado: haciendo sonar buzzer." : "Localizador desactivado.", nuevoEstado ? "warn" : "normal");
    cicloPrincipal();
});

// --- POP-UP DE INFORMACIÓN MÉDICA ---
$("btnInfoSalud").addEventListener("click", () => {
    listaLinksPastillas.innerHTML = "";
    const nombres = Object.keys(tratamientosMap);
    if (!nombres.length) {
        listaLinksPastillas.innerHTML = `<span class="helper-text">Sin medicamentos registrados.</span>`;
    } else {
        nombres.forEach((nombre) => {
            const link = document.createElement("a");
            link.className = "time-chip";
            link.href = `https://vsearch.nlm.nih.gov/vivisimo/cgi-bin/query-meta?v%3Aproject=medlineplus-spanish&query=${encodeURIComponent(nombre)}`;
            link.target = "_blank"; link.rel = "noopener noreferrer"; link.innerText = `Buscar: ${nombre}`;
            listaLinksPastillas.appendChild(link);
        });
    }
    modalSalud.classList.remove("hidden");
});
$("btnCerrarSalud").addEventListener("click", () => modalSalud.classList.add("hidden"));

// --- MONITOR Y SIMULADOR EN TIEMPO REAL ---

function renderizarInterfaz({ estado_pastillero: est, configuracion: conf }) {
    $("txtConexion").innerText = "En línea";
    $("txtConexion").className = "text-ok";

    // DS PARCHE 6: Sincronización en vivo si otro dispositivo cambia la dosis
    if (conf) {
        let remoto = {};
        if (conf.tratamientos) {
            Object.entries(conf.tratamientos).forEach(([k, v]) => {
                remoto[k] = typeof v === "object" ? v.intervalo_horas : Number(v);
            });
        }

        if (!esquemaInicialCargado) {
            tratamientosMap = remoto;
            if (conf.hora_alarma) inputHora.value = conf.hora_alarma;
            esquemaInicialCargado = true;
            renderizarListaPastillas();
        } else {
            const remotoStr = JSON.stringify(remoto);
            const localStr = JSON.stringify(tratamientosMap);
            if (remotoStr !== localStr && modalConfirmar.classList.contains("hidden")) {
                tratamientosMap = remoto;
                if (conf.hora_alarma) inputHora.value = conf.hora_alarma;
                renderizarListaPastillas();
                registrarEvento("Esquema actualizado de forma remota.", "normal");
            }
        }
    }

    buscandoPastillero = Boolean(est.buscar_pastillero);
    btnBuscarPastillero.innerText = buscandoPastillero ? "Detener localizador (Buzzer)" : "Localizar pastillero (Buzzer)";
    btnBuscarPastillero.className = buscandoPastillero ? "btn-warning" : "btn-secondary";

    const actuadorActivo = est.alarma_sonando || buscandoPastillero;
    $("txtTiempo").innerText = `${String(est.segundos_sin_tomar).padStart(2, "0")} h`;
    $("txtHoraProgramada").innerText = conf.hora_alarma || "07:00";
    $("txtAlarma").innerText = est.alarma_sonando ? "Sonando" : (buscandoPastillero ? "Localizando" : "Apagado");
    $("ledIndicador").className = actuadorActivo ? "led-dot activo" : "led-dot";

    const txtConf = est.cuidador_confirmo ? "Confirmado" : "Pendiente";
    $("txtCuidador").innerText = txtConf;
    $("txtEstadoConfirmacion").innerText = txtConf;
    $("txtNivelCodigo").innerText = `Estado ${est.nivel_alerta}`;

    // Deshabilita el botón si ya está confirmado o si aún no hay alerta
    btnConfirmar.disabled = !(est.nivel_alerta >= 1 && !est.cuidador_confirmo);

    let maxHoras = 48;
    if (configLocal.bot2.activo) maxHoras = configLocal.bot2.horas;
    else if (configLocal.bot1.activo) maxHoras = configLocal.bot1.horas;
    else maxHoras = 24;

    $("barraProgreso").style.width = `${Math.min((est.segundos_sin_tomar / maxHoras) * 100, 100)}%`;
    $("barraProgreso").className = `progress-fill fill-${est.nivel_alerta}`;

    $("lblFase1").innerText = configLocal.bot1.activo ? `${configLocal.bot1.horas} h: Cuidador` : "Cuidador (Apagado)";
    $("lblFase2").innerText = configLocal.bot2.activo ? `${configLocal.bot2.horas} h: Emergencia` : "Emergencia (Apagado)";

    [0, 1, 2].forEach((n) => {
        $(`etapa${n}`).className = est.nivel_alerta === n ? "stage-box active" : "stage-box";
    });

    const textosEstado = [
        ["Estado 0: Normal", est.cuidador_confirmo ? "Asistencia confirmada por el cuidador" : (est.alarma_sonando ? "Esperando toma de pastilla" : "Sin alertas activas")],
        [`Estado 1: Alerta ${configLocal.bot1.horas} h`, "Aviso enviado al cuidador"],
        [`Estado 2: Emergencia ${configLocal.bot2.horas} h`, "Aviso enviado a emergencias"]
    ];

    $("badgeEstado").className = `status-tag estado-${est.nivel_alerta}`;
    $("badgeEstado").innerText = textosEstado[est.nivel_alerta][0];
    $("txtProtocoloDetalle").innerText = textosEstado[est.nivel_alerta][1];

    if (ultimaAlarma !== null && ultimaAlarma !== est.alarma_sonando && est.alarma_sonando) {
        registrarEvento("Alarma activada en ESP32.");
    }

    ultimoNivel = est.nivel_alerta;
    ultimaAlarma = est.alarma_sonando;
}

async function cicloPrincipal() {
    if (procesandoTick) return;
    procesandoTick = true;

    try {
        const res = await fetch(`${FIREBASE_URL}/.json`);
        const data = await res.json();
        if (!data) return;

        if (simuladorActivo) {
            const est = data.estado_pastillero;
            const segundos = est.segundos_sin_tomar + 1;
            const nuevoEstado = {
                ...est,
                alarma_sonando: true,
                segundos_sin_tomar: segundos,
                nivel_alerta: calcularNivelAlerta(segundos, est.cuidador_confirmo)
            };
            await patchFirebase("estado_pastillero", nuevoEstado);
            data.estado_pastillero = nuevoEstado;
        }

        const estActual = data.estado_pastillero;
        const notif = data.notificaciones_enviadas || { alerta_24h_telegram: false, emergencia_48h_telegram: false };
        const listaMeds = Object.keys(tratamientosMap).join(", ") || "Sin especificar";
        const msgPaciente = `\n\nDatos Clínicos:\nPaciente: ${configLocal.paciente.nombre || "No registrado"}\nSangre: ${configLocal.paciente.sangre || "N/A"}\nAlergias: ${configLocal.paciente.alergias || "Ninguna"}\nDirección: ${configLocal.paciente.direccion || "No registrada"}`;
        const horasPasadas = estActual.segundos_sin_tomar;

        // DS PARCHE 3: BOT 1 (Cuidador) - Evaluado y sellado SOLO tras confirmar envío
        if (configLocal.bot1.activo && horasPasadas >= configLocal.bot1.horas && !estActual.cuidador_confirmo) {

            if (!notif.alerta_24h_telegram) {
                const ok = await enviarTelegram(
                    configLocal.bot1.token, configLocal.bot1.chat,
                    `[PíldHora - Alerta Preventiva]\nEl paciente lleva ${horasPasadas} horas sin registrar su toma de: ${listaMeds}. Por favor confirme la revisión en el monitor web.` + msgPaciente
                );
                // Bloquea el envío en Firebase SÓLO si Telegram lo procesó bien
                if (ok) {
                    await patchFirebase("notificaciones_enviadas", { alerta_24h_telegram: true });
                    registrarEvento("Telegram: Aviso inicial enviado al cuidador.", "warn");
                }
            }
            // Ciclo de insistencia (Nagging)
            else if (horasPasadas !== ultimaHoraAviso && (horasPasadas - configLocal.bot1.horas) % configLocal.bot1.repeticion === 0) {
                ultimaHoraAviso = horasPasadas;
                const ok = await enviarTelegram(
                    configLocal.bot1.token, configLocal.bot1.chat,
                    `[PíldHora - Recordatorio]\nEl paciente lleva ${horasPasadas} horas sin registrar su toma de: ${listaMeds}. Por favor confirme la revisión en el monitor web.` + msgPaciente
                );
                if (ok) registrarEvento(`Telegram: Aviso repetido enviado (${horasPasadas} h).`, "warn");
            }
        }

        // DS PARCHE 3: BOT 2 (Emergencias) - Un solo disparo crítico verificado
        if (configLocal.bot2.activo && estActual.nivel_alerta === 2 && !notif.emergencia_48h_telegram) {
            const ok = await enviarTelegram(
                configLocal.bot2.token, configLocal.bot2.chat,
                `[PíldHora - EMERGENCIA CRÍTICA]\nHan transcurrido ${horasPasadas} horas sin toma de medicamento (${listaMeds}) y el sensor del pastillero sigue sin pulsarse. Se requiere atención médica inmediata.` + msgPaciente
            );
            if (ok) {
                await patchFirebase("notificaciones_enviadas", { emergencia_48h_telegram: true });
                registrarEvento("Telegram: Alerta crítica enviada a EMERGENCIAS.", "danger");
            }
        }

        renderizarInterfaz(data);
    } catch {
        $("txtConexion").innerText = "Sin red";
        $("txtConexion").className = "";
    } finally {
        procesandoTick = false;
    }
}

btnConfirmar.addEventListener("click", async () => {
    simuladorActivo = false;
    btnToggleReloj.innerText = "Iniciar reloj";
    // DS PARCHE 4: La confirmación apaga el sonido y quita la alerta, pero el tiempo NO se perdona.
    await patchFirebase("estado_pastillero", { cuidador_confirmo: true, alarma_sonando: false });
    registrarEvento("Cuidador confirmó revisión. Alarmas preventivas silenciadas.", "ok");
    cicloPrincipal();
});

btnToggleReloj.addEventListener("click", async () => {
    simuladorActivo = !simuladorActivo;
    btnToggleReloj.innerText = simuladorActivo ? "Pausar reloj" : "Iniciar reloj";

    if (simuladorActivo) {
        const res = await fetch(`${FIREBASE_URL}/estado_pastillero.json`);
        const est = await res.json();
        if (est.segundos_sin_tomar === 0 || est.cuidador_confirmo) {
            ultimaHoraAviso = -1;
            await patchFirebase("estado_pastillero", { segundos_sin_tomar: 0, nivel_alerta: 0, cuidador_confirmo: false, alarma_sonando: true });
            await patchFirebase("notificaciones_enviadas", { alerta_24h_telegram: false, emergencia_48h_telegram: false });
        }
    }
    registrarEvento(simuladorActivo ? "Reloj demo iniciado." : "Reloj demo pausado.");
});

$("btnTomarPastilla").addEventListener("click", async () => {
    simuladorActivo = false;
    btnToggleReloj.innerText = "Iniciar reloj";
    ultimaHoraAviso = -1;
    await patchFirebase("estado_pastillero", { alarma_sonando: false, buscar_pastillero: false, segundos_sin_tomar: 0, nivel_alerta: 0, cuidador_confirmo: false });
    await patchFirebase("notificaciones_enviadas", { alerta_24h_telegram: false, emergencia_48h_telegram: false });
    registrarEvento("Toma registrada / Sistema reiniciado a 0 h.", "ok");
    cicloPrincipal();
});

$("btnLimpiarLog").addEventListener("click", () => (listaEventos.innerHTML = ""));

renderizarListaPastillas();
registrarEvento("Sistema conectado y protegido.");
setInterval(cicloPrincipal, 1000);
cicloPrincipal();