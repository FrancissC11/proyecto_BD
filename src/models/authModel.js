const { getConnection, sql } = require('../config/db');

async function loginUser(cedula, password) {
    try {
        const pool = await getConnection();

        // 1. PRIMERO BUSCAMOS EN EMPLEADOS (Tienen roles especiales)
        let result = await pool.request()
            .input('cedula', sql.VarChar, cedula)
            .input('pass', sql.VarChar, password)
            .query(`
                SELECT id_empleado AS id, nombres, apellidos, rol 
                FROM estetica.Empleado 
                WHERE cedula = @cedula AND contrasena = @pass
            `);

        if (result.recordset.length > 0) {
            // Encontramos un empleado/admin/gerente
            return { type: 'empleado', data: result.recordset[0] };
        }

        // 2. SI NO ES EMPLEADO, BUSCAMOS EN CLIENTES
        result = await pool.request()
            .input('cedula', sql.VarChar, cedula)
            .input('pass', sql.VarChar, password)
            .query(`
                SELECT id_cliente AS id, nombres, apellidos 
                FROM estetica.Cliente 
                WHERE cedula = @cedula AND contrasena = @pass
            `);

        if (result.recordset.length > 0) {
            // Encontramos un cliente (Forzamos el rol 'cliente')
            return { type: 'cliente', data: { ...result.recordset[0], rol: 'cliente' } };
        }

        // 3. NO SE ENCONTRÓ NADIE
        return null;

    } catch (error) {
        console.error('Error en loginUser:', error);
        throw error;
    }
}

// ... (código existente de loginUser) ...

// FUNCIÓN PARA CREAR NUEVO CLIENTE
async function createCliente(datos) {
    try {
        const pool = await getConnection();
        
        // Insertamos en la tabla estetica.Cliente
        // NOTA: Usamos los nombres de columnas de tu BD
        const result = await pool.request()
            .input('cedula', sql.Char(10), datos.cedula)
            .input('nombres', sql.VarChar(60), datos.nombres)
            .input('apellidos', sql.VarChar(60), datos.apellidos)
            .input('telefono', sql.VarChar(10), datos.telefono)
            .input('correo', sql.VarChar(30), datos.correo)
            .input('pass', sql.VarChar(50), datos.contrasena) // Campo nuevo que agregamos
            .query(`
                INSERT INTO estetica.Cliente (cedula, nombres, apellidos, telefono, correo, contrasena)
                VALUES (@cedula, @nombres, @apellidos, @telefono, @correo, @pass)
            `);

        return result;
    } catch (error) {
        console.error('Error al registrar cliente:', error);
        throw error;
    }
}

// ACTUALIZAR EL EXPORTS
module.exports = { loginUser, createCliente };