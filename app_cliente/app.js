const FIREBASE_URL = "https://pastillero-inteligente-61c54-default-rtdb.firebaseio.com";
const $ = (id) => document.getElementById(id);

let simuladorActivo = false;
let procesandoTick = false;
let esquemaInicialCargado = false;
let ultimoNivel = null;
let ultimaAlarma = null;
let tratamientosMap = { "Paracetamol": 8 };

const PALABRA_CONFIRMACION = "confirmar";
const SEGUNDOS_AUTO_BLOQUEO = 120;
let modoEdicionDesbloqueado = false;
let temporizadorAutoBloqueo = null;

const inputHora = $("inputHora");
const inputNombre = $("inputNombrePastilla");
const inputIntervalo = $("inputIntervaloPastilla");
const contenedorIntervalos = $("contenedorIntervalos");
const listaHorariosDia = $("listaHorariosDia");
const listaEventos = $("listaEventos");
const btnConfirmar = $("btnConfirmarCuidador");
const btnToggleReloj = $("btnToggleReloj");

// Helper único para peticiones PATCH a Firebase
async function patchFirebase(nodo, datos) {
    await fetch(`${FIREBASE_URL}/${nodo}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos)
    });
}

function registrarEvento(mensaje, tipo = "normal") {
    const ahora = new Date().toLocaleTimeString("es-MX", { hour12: false });
    const item = document.createElement("div");
    item.className = `log-entry log-${tipo}`;
    item.innerHTML = `<span class="log-time">[${ahora}]</span><span>${mensaje}</span>`;
    listaEventos.prepend(item);
}

function calcularNivelAlerta(segundos, cuidadorConfirmo) {
    if (cuidadorConfirmo) return 0;
    if (segundos >= 48) return 2;
    if (segundos >= 24) return 1;
    return 0;
}

// --- MODO ANTIACCIDENTES (TODO 1): PROTECCION DE ESCRITURA ---

function controlesProtegidos() {
    return [
        inputNombre,
        inputIntervalo,
        $("btnAgregarPastilla"),
        $("btnRecomendar"),
        inputHora,
        $("btnGuardarHora"),
        ...contenedorIntervalos.querySelectorAll("button")
    ];
}

function aplicarEstadoBloqueo() {
    const bloqueado = !modoEdicionDesbloqueado;

    controlesProtegidos().forEach((elemento) => {
        if (elemento) elemento.disabled = bloqueado;
    });

    $("txtBloqueo").innerText = bloqueado ? "Bloqueado" : "Desbloqueado";
    $("txtBloqueo").className = `gate-tag ${bloqueado ? "gate-locked" : "gate-open"}`;
    $("panelBloqueo").className = `unlock-gate ${bloqueado ? "gate-locked" : "gate-open"}`;
    $("btnBloquear").disabled = bloqueado;
    $("txtAyudaBloqueo").innerText = bloqueado
        ? "Escribe la palabra confirmar para habilitar la edición de medicamentos y horarios."
        : "Edición habilitada. Se bloqueará sola tras 2 minutos sin cambios.";
}

function reiniciarTemporizadorBloqueo() {
    clearTimeout(temporizadorAutoBloqueo);
    if (!modoEdicionDesbloqueado) return;

    temporizadorAutoBloqueo = setTimeout(() => bloquearEdicion(true), SEGUNDOS_AUTO_BLOQUEO * 1000);
}

function desbloquearEdicion() {
    modoEdicionDesbloqueado = true;
    aplicarEstadoBloqueo();
    reiniciarTemporizadorBloqueo();
    registrarEvento("Modo antiaccidentes: edición desbloqueada.", "warn");
}

function bloquearEdicion(automatico = false) {
    modoEdicionDesbloqueado = false;
    clearTimeout(temporizadorAutoBloqueo);
    $("inputConfirmar").value = "";
    aplicarEstadoBloqueo();
    if (automatico) registrarEvento("Modo antiaccidentes: bloqueo automático aplicado.", "warn");
}

$("inputConfirmar").addEventListener("input", (evento) => {
    const coincide = evento.target.value.trim().toLowerCase() === PALABRA_CONFIRMACION;
    if (coincide && !modoEdicionDesbloqueado) desbloquearEdicion();
    else if (!coincide && modoEdicionDesbloqueado) bloquearEdicion();
});

$("btnBloquear").addEventListener("click", () => {
    bloquearEdicion();
    registrarEvento("Modo antiaccidentes: edición bloqueada manualmente.", "warn");
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
        aplicarEstadoBloqueo();
        return;
    }

    entradas.forEach(([nombre, intervalo]) => {
        const fila = document.createElement("div");
        fila.className = "interval-item";
        fila.innerHTML = `<div><strong>${nombre}</strong><span class="pill-meta">Cada ${intervalo} h</span></div><button class="btn-remove">Quitar</button>`;
        fila.querySelector("button").addEventListener("click", () => {
            if (!modoEdicionDesbloqueado) {
                registrarEvento("Acción bloqueada por el modo antiaccidentes.", "warn");
                return;
            }

            delete tratamientosMap[nombre];
            reiniciarTemporizadorBloqueo();
            renderizarListaPastillas();
        });
        contenedorIntervalos.appendChild(fila);
    });

    actualizarVistaPreviaHorarios();
    aplicarEstadoBloqueo();
}

$("btnAgregarPastilla").addEventListener("click", () => {
    if (!modoEdicionDesbloqueado) {
        registrarEvento("Acción bloqueada por el modo antiaccidentes.", "warn");
        return;
    }

    const nombre = inputNombre.value.trim();
    const intervalo = parseInt(inputIntervalo.value, 10);
    if (!nombre || isNaN(intervalo) || intervalo < 1 || intervalo > 24) return;

    tratamientosMap[nombre] = intervalo;
    inputNombre.value = "";
    reiniciarTemporizadorBloqueo();
    renderizarListaPastillas();
});

$("btnRecomendar").addEventListener("click", () => {
    if (!modoEdicionDesbloqueado) {
        registrarEvento("Acción bloqueada por el modo antiaccidentes.", "warn");
        return;
    }
    if (!Object.keys(tratamientosMap).length) return;

    let mejorHora = "07:00";
    let menorCosto = Infinity;
    let maxHorasSueno = 0;

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

        if (costo < menorCosto) {
            menorCosto = costo;
            mejorHora = candidatoStr;
            maxHorasSueno = mayorVentana;
        }
    }

    inputHora.value = mejorHora;
    actualizarVistaPreviaHorarios();
    reiniciarTemporizadorBloqueo();
    registrarEvento(`Inicio óptimo: ${mejorHora} (ventana máx. sin alarmas: ${maxHorasSueno} h).`, "ok");
});

inputHora.addEventListener("input", () => {
    actualizarVistaPreviaHorarios();
    reiniciarTemporizadorBloqueo();
});

$("btnGuardarHora").addEventListener("click", async () => {
    if (!modoEdicionDesbloqueado) {
        registrarEvento("Acción bloqueada por el modo antiaccidentes.", "warn");
        return;
    }

    const horaInicio = inputHora.value;
    const horariosDia = calcularTomasDelDia(horaInicio, tratamientosMap).map((t) => t.hora);

    await patchFirebase("configuracion", {
        hora_alarma: horaInicio,
        hora_inicio: horaInicio,
        tratamientos: tratamientosMap,
        horarios_dia: horariosDia
    });
    registrarEvento(`Esquema guardado (${Object.keys(tratamientosMap).length} med).`);
    bloquearEdicion();
    cicloPrincipal();
});

// --- MONITOR Y SIMULADOR EN TIEMPO REAL ---

function renderizarInterfaz({ estado_pastillero: est, configuracion: conf }) {
    $("txtConexion").innerText = "En línea";
    $("txtConexion").className = "text-ok";

    if (!esquemaInicialCargado && conf) {
        if (conf.tratamientos) {
            tratamientosMap = {};
            Object.entries(conf.tratamientos).forEach(([k, v]) => {
                tratamientosMap[k] = typeof v === "object" ? v.intervalo_horas : Number(v);
            });
        }
        if (conf.hora_alarma) inputHora.value = conf.hora_alarma;
        esquemaInicialCargado = true;
        renderizarListaPastillas();
    }

    $("txtTiempo").innerText = `${String(est.segundos_sin_tomar).padStart(2, "0")} h`;
    $("txtHoraProgramada").innerText = conf.hora_alarma || "07:00";
    $("txtAlarma").innerText = est.alarma_sonando ? "Sonando" : "Apagado";
    $("ledIndicador").className = est.alarma_sonando ? "led-dot activo" : "led-dot";

    const txtConf = est.cuidador_confirmo ? "Confirmado" : "Pendiente";
    $("txtCuidador").innerText = txtConf;
    $("txtEstadoConfirmacion").innerText = txtConf;
    $("txtNivelCodigo").innerText = `Estado ${est.nivel_alerta}`;
    btnConfirmar.disabled = !(est.segundos_sin_tomar >= 24 && !est.cuidador_confirmo);

    $("barraProgreso").style.width = `${Math.min((est.segundos_sin_tomar / 48) * 100, 100)}%`;
    $("barraProgreso").className = `progress-fill fill-${est.nivel_alerta}`;

    [0, 1, 2].forEach((n) => {
        $(`etapa${n}`).className = est.nivel_alerta === n ? "stage-box active" : "stage-box";
    });

    const textosEstado = [
        ["Estado 0: Normal", est.cuidador_confirmo ? "Asistencia confirmada por el cuidador" : (est.alarma_sonando ? "Esperando toma de pastilla" : "Sin alertas activas")],
        ["Estado 1: Alerta 24 h", "Aviso enviado al cuidador"],
        ["Estado 2: Emergencia 48 h", "Aviso enviado a servicios de emergencia"]
    ];

    $("badgeEstado").className = `status-tag estado-${est.nivel_alerta}`;
    $("badgeEstado").innerText = textosEstado[est.nivel_alerta][0];
    $("txtProtocoloDetalle").innerText = textosEstado[est.nivel_alerta][1];

    if (ultimaAlarma !== null && ultimaAlarma !== est.alarma_sonando && est.alarma_sonando) {
        registrarEvento("Alarma activada en ESP32.");
    }
    if (ultimoNivel !== null && ultimoNivel !== est.nivel_alerta) {
        if (est.nivel_alerta === 1) registrarEvento("24 h sin toma: Alerta enviada al cuidador.", "warn");
        else if (est.nivel_alerta === 2) registrarEvento("48 h sin toma: Alerta enviada a emergencias.", "danger");
        else registrarEvento("Sistema en Estado 0 (Normal).", "ok");
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
                alarma_sonando: true,
                segundos_sin_tomar: segundos,
                nivel_alerta: calcularNivelAlerta(segundos, est.cuidador_confirmo),
                cuidador_confirmo: est.cuidador_confirmo
            };
            await patchFirebase("estado_pastillero", nuevoEstado);
            data.estado_pastillero = nuevoEstado;
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
    await patchFirebase("estado_pastillero", {
        cuidador_confirmo: true,
        nivel_alerta: 0,
        alarma_sonando: false
    });
    registrarEvento("Cuidador confirmó revisión. Emergencia de 48 h cancelada.", "ok");
    cicloPrincipal();
});

btnToggleReloj.addEventListener("click", async () => {
    simuladorActivo = !simuladorActivo;
    btnToggleReloj.innerText = simuladorActivo ? "Pausar reloj" : "Iniciar reloj";

    if (simuladorActivo) {
        const res = await fetch(`${FIREBASE_URL}/estado_pastillero.json`);
        const est = await res.json();
        if (est.segundos_sin_tomar === 0 || est.cuidador_confirmo) {
            await patchFirebase("estado_pastillero", {
                segundos_sin_tomar: 0,
                nivel_alerta: 0,
                cuidador_confirmo: false,
                alarma_sonando: true
            });
        }
    }
    registrarEvento(simuladorActivo ? "Reloj demo iniciado." : "Reloj demo pausado.");
});

$("btnTomarPastilla").addEventListener("click", async () => {
    simuladorActivo = false;
    btnToggleReloj.innerText = "Iniciar reloj";
    await patchFirebase("estado_pastillero", {
        alarma_sonando: false,
        segundos_sin_tomar: 0,
        nivel_alerta: 0,
        cuidador_confirmo: false
    });
    registrarEvento("Toma registrada / Sistema reiniciado a 0 h.", "ok");
    cicloPrincipal();
});

$("btnLimpiarLog").addEventListener("click", () => (listaEventos.innerHTML = ""));

renderizarListaPastillas();
aplicarEstadoBloqueo();
registrarEvento("Sistema conectado.");
setInterval(cicloPrincipal, 1000);
cicloPrincipal();