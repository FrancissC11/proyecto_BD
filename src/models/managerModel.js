const { getConnection, sql } = require('../config/db');

const ManagerModel = {};

// 1. Obtener información del gerente y su sucursal
ManagerModel.getGerenteInfo = async (idEmpleado) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, idEmpleado)
            .query(`
                SELECT 
                    e.id_empleado,
                    e.nombres + ' ' + e.apellidos as nombre_gerente,
                    e.id_sucursal,
                    s.nombre as nombre_sucursal
                FROM estetica.Empleado e
                JOIN estetica.Sucursal s ON e.id_sucursal = s.id_sucursal
                WHERE e.id_empleado = @id AND e.rol = 'gerente'
            `);
        return result.recordset[0];
    } catch (error) {
        console.error("Error en getGerenteInfo:", error);
        throw error;
    }
};

// 2. Obtener empleados de la sucursal (excluyendo al gerente)
ManagerModel.getEmpleadosSucursal = async (idSucursal) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id_sucursal', sql.Int, idSucursal)
            .query(`
                SELECT 
                    id_empleado,
                    nombres,
                    apellidos,
                    especialidad,
                    telefono,
                    estado
                FROM estetica.Empleado
                WHERE id_sucursal = @id_sucursal 
                  AND especialidad IS NOT NULL
                ORDER BY nombres
            `);
        return result.recordset;
    } catch (error) {
        console.error("Error en getEmpleadosSucursal:", error);
        throw error;
    }
};

// 3. Obtener inventario de la sucursal
ManagerModel.getInventarioSucursal = async (idSucursal) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id_sucursal', sql.Int, idSucursal)
            .query(`
                SELECT 
                    p.id_producto,
                    p.nombre as producto,
                    cp.nombre as categoria,
                    i.stock_actual,
                    i.stock_minimo,
                    CASE 
                        WHEN i.stock_actual <= 0 THEN 'Sin Stock'
                        WHEN i.stock_actual <= i.stock_minimo THEN 'Bajo Stock'
                        ELSE 'Disponible'
                    END as estado
                FROM estetica.Inventario_Sucursal i
                JOIN estetica.Producto p ON i.id_producto = p.id_producto
                JOIN estetica.Categoria_Producto cp ON p.id_categoria_producto = cp.id_categoria_producto
                WHERE i.id_sucursal = @id_sucursal
                ORDER BY p.nombre
            `);
        return result.recordset;
    } catch (error) {
        console.error("Error en getInventarioSucursal:", error);
        throw error;
    }
};

// 4. Registrar nuevo empleado
ManagerModel.crearEmpleado = async (data) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id_sucursal', sql.Int, data.id_sucursal)
            .input('cedula', sql.Char(10), data.cedula)
            .input('nombres', sql.VarChar(60), data.nombres)
            .input('apellidos', sql.VarChar(60), data.apellidos)
            .input('especialidad', sql.VarChar(20), data.especialidad)
            .input('telefono', sql.VarChar(10), data.telefono || null)
            .input('rol', sql.VarChar(20), 'empleado')
            .query(`
                INSERT INTO estetica.Empleado (id_sucursal, cedula, nombres, apellidos, especialidad, telefono, estado, rol)
                VALUES (@id_sucursal, @cedula, @nombres, @apellidos, @especialidad, @telefono, 'Activo', @rol);
                SELECT SCOPE_IDENTITY() as id;
            `);
        return result.recordset[0];
    } catch (error) {
        console.error("Error en crearEmpleado:", error);
        throw error;
    }
};

// 5. Eliminar empleado (despedir)
ManagerModel.eliminarEmpleado = async (idEmpleado) => {
    try {
        const pool = await getConnection();
        
        // Primero verificamos que no tenga citas pendientes
        const checkCitas = await pool.request()
            .input('id_empleado', sql.Int, idEmpleado)
            .query(`
                SELECT COUNT(*) as total 
                FROM estetica.Cita 
                WHERE id_empleado = @id_empleado AND estado = 'Pendiente'
            `);
        
        if (checkCitas.recordset[0].total > 0) {
            throw new Error('No se puede eliminar: el empleado tiene citas pendientes');
        }

        // Eliminar horarios del empleado primero (por FK)
        await pool.request()
            .input('id_empleado', sql.Int, idEmpleado)
            .query(`DELETE FROM estetica.Horario_Empleado WHERE id_empleado = @id_empleado`);

        // Ahora sí eliminar al empleado
        await pool.request()
            .input('id_empleado', sql.Int, idEmpleado)
            .query(`DELETE FROM estetica.Empleado WHERE id_empleado = @id_empleado`);

        return { success: true };
    } catch (error) {
        console.error("Error en eliminarEmpleado:", error);
        throw error;
    }
};

module.exports = ManagerModel;