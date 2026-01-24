const AppointmentModel = require('../models/appointmentModel');

const controller = {};

// API: Datos iniciales
controller.getDataForForm = async (req, res) => {
    try {
        const sucursales = await AppointmentModel.getSucursales();
        const especialidades = await AppointmentModel.getEspecialidades();
        res.json({ sucursales, especialidades });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// API: Empleados
controller.getEmpleados = async (req, res) => {
    const { id_sucursal, especialidad } = req.query;
    try {
        const empleados = await AppointmentModel.getEmpleadosFilter(id_sucursal, especialidad);
        res.json(empleados);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// API: SLOTS DISPONIBLES (Aquí estaba el problema posible)
controller.getAvailableSlots = async (req, res) => {
    const { id_empleado, fecha } = req.query;

    console.log(`---> Buscando slots para Emp: ${id_empleado}, Fecha: ${fecha}`);

    try {
        // 1. Calcular Día de la Semana con corrección de zona horaria
        const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
        const dateObj = new Date(fecha + 'T00:00:00'); // Forzamos hora 00:00 para que no reste día
        const diaNombre = diasSemana[dateObj.getDay()];

        console.log(`---> Día calculado: ${diaNombre}`);

        // 2. Obtener Horario Laboral
        const horario = await AppointmentModel.getHorarioLaboral(id_empleado, diaNombre);

        if (!horario) {
            console.log("---> No se encontró horario en BD para este empleado/día");
            return res.json([]); // Retorna lista vacía si no trabaja
        }

        // 3. Obtener Citas ya ocupadas
        const citasOcupadasRaw = await AppointmentModel.getCitasDelDia(id_empleado, fecha);
        const horasOcupadas = citasOcupadasRaw.map(c => c.hora); // ['09:00', '14:00']

        // 4. GENERAR BLOQUES DE 2 HORAS
        let slots = [];
        
        // Función: "09:00" -> 540 minutos
        const toMinutes = (h) => {
            const [hh, mm] = h.split(':').map(Number); 
            return hh * 60 + mm;
        };
        
        // Función: 540 -> "09:00"
        const toTimeStr = (m) => {
            const hh = Math.floor(m / 60).toString().padStart(2, '0');
            const mm = (m % 60).toString().padStart(2, '0');
            return `${hh}:${mm}`;
        };

        let currentMin = toMinutes(horario.hora_inicio);
        const endMin = toMinutes(horario.hora_fin);
        const duracionServicio = 120; // 2 HORAS

        console.log(`---> Generando slots de ${horario.hora_inicio} a ${horario.hora_fin}`);

        while (currentMin + duracionServicio <= endMin) { // Cambio: aseguramos que el servicio quepa antes del cierre
            const horaStr = toTimeStr(currentMin);
            
            // Si la hora NO está ocupada, la agregamos
            if (!horasOcupadas.includes(horaStr)) {
                slots.push(horaStr);
            } else {
                console.log(`---> Slot ${horaStr} ocupado`);
            }

            currentMin += duracionServicio; 
        }

        console.log(`---> Slots encontrados: ${slots}`);
        res.json(slots);

    } catch (error) {
        console.error("Error en getAvailableSlots:", error);
        res.status(500).json({ error: error.message });
    }
};

// API: Mis Citas
controller.getMyAppointments = async (req, res) => {
    const { id_cliente } = req.query;
    try {
        const citas = await AppointmentModel.getCitasByCliente(id_cliente);
        res.json(citas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST: Guardar Cita
controller.saveAppointment = async (req, res) => {
    const { id_sucursal, id_empleado, fecha, hora, id_cliente_hidden } = req.body;
    try {
        await AppointmentModel.createCita({
            id_sucursal,
            id_cliente: id_cliente_hidden,
            id_empleado,
            fecha,
            hora
        });
        res.redirect(`/user?id=${id_cliente_hidden}`);
    } catch (error) {
        console.error(error);
        res.send("Error al guardar la cita.");
    }
};

// DELETE: Cancelar Cita
controller.cancelAppointment = async (req, res) => {
    const { id_cita } = req.params;
    try {
        await AppointmentModel.deleteCita(id_cita);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
};

module.exports = controller;