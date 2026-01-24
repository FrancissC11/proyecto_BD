const { getConnection, sql } = require('../config/db');

const AppointmentModel = {};

// 1. Obtener Sucursales
AppointmentModel.getSucursales = async () => {
    const pool = await getConnection();
    const result = await pool.request().query("SELECT id_sucursal, nombre FROM estetica.Sucursal");
    return result.recordset;
};

// 2. Obtener Especialidades
AppointmentModel.getEspecialidades = async () => {
    const pool = await getConnection();
    const result = await pool.request().query("SELECT DISTINCT especialidad FROM estetica.Empleado WHERE especialidad IS NOT NULL AND estado = 'Activo'");
    return result.recordset;
};

// 3. Obtener Empleados (Filtro)
AppointmentModel.getEmpleadosFilter = async (idSucursal, especialidad) => {
    const pool = await getConnection();
    const result = await pool.request()
        .input('id_sucursal', sql.Int, idSucursal)
        .input('especialidad', sql.VarChar, especialidad)
        .query("SELECT id_empleado, nombres, apellidos FROM estetica.Empleado WHERE id_sucursal = @id_sucursal AND especialidad = @especialidad AND estado = 'Activo'");
    return result.recordset;
};

// 4. NUEVO: Obtener Horario de un Empleado en un Día (Lunes, Martes...)
AppointmentModel.getHorarioLaboral = async (idEmpleado, diaSemana) => {
    const pool = await getConnection();
    const result = await pool.request()
        .input('id_empleado', sql.Int, idEmpleado)
        .input('dia', sql.VarChar, diaSemana)
        // Convertimos a varchar para asegurar formato HH:MM
        .query(`
            SELECT 
                CONVERT(varchar(5), hora_inicio, 108) as hora_inicio, 
                CONVERT(varchar(5), hora_fin, 108) as hora_fin 
            FROM estetica.Horario_Empleado 
            WHERE id_empleado = @id_empleado AND dia_semana = @dia
        `);
    return result.recordset[0]; 
};

// 5. NUEVO: Obtener Citas Ocupadas (Para descartar horas)
AppointmentModel.getCitasDelDia = async (idEmpleado, fecha) => {
    const pool = await getConnection();
    const result = await pool.request()
        .input('id_empleado', sql.Int, idEmpleado)
        .input('fecha', sql.Date, fecha)
        .query(`
            SELECT CONVERT(varchar(5), hora, 108) as hora
            FROM estetica.Cita 
            WHERE id_empleado = @id_empleado AND fecha = @fecha AND estado != 'Cancelada'
        `);
    // Retorna array tipo: [{ hora: '09:00' }, { hora: '11:00' }]
    return result.recordset;
};

// 6. Crear Cita
AppointmentModel.createCita = async (data) => {
    const pool = await getConnection();
    await pool.request()
        .input('id_sucursal', sql.Int, data.id_sucursal)
        .input('id_cliente', sql.Int, data.id_cliente)
        .input('id_empleado', sql.Int, data.id_empleado)
        .input('fecha', sql.Date, data.fecha)
        .input('hora', sql.VarChar(5), data.hora) 
        .query(`
            INSERT INTO estetica.Cita (id_sucursal, id_cliente, id_empleado, fecha, hora, estado, canal_origen)
            VALUES (@id_sucursal, @id_cliente, @id_empleado, @fecha, @hora, 'Pendiente', 'Web')
        `);
};

// 7. Listar Citas Cliente
AppointmentModel.getCitasByCliente = async (idCliente) => {
    const pool = await getConnection();
    const result = await pool.request()
        .input('id', sql.Int, idCliente)
        .query(`
            SELECT c.id_cita, c.fecha, c.hora, c.estado, s.nombre as sucursal, e.nombres + ' ' + e.apellidos as empleado
            FROM estetica.Cita c
            JOIN estetica.Sucursal s ON c.id_sucursal = s.id_sucursal
            JOIN estetica.Empleado e ON c.id_empleado = e.id_empleado
            WHERE c.id_cliente = @id
            ORDER BY c.fecha DESC
        `);
    return result.recordset;
};

// 8. Eliminar Cita
AppointmentModel.deleteCita = async (idCita) => {
    const pool = await getConnection();
    await pool.request().input('id_cita', sql.Int, idCita).query("DELETE FROM estetica.Cita WHERE id_cita = @id_cita");
};

module.exports = AppointmentModel;