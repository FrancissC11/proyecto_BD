const { getConnection, sql } = require('../config/db');

const AdminModel = {};

// 1. Obtener información del administrador
AdminModel.getAdminInfo = async (idEmpleado) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, idEmpleado)
            .query(`
                SELECT 
                    id_empleado,
                    nombres + ' ' + apellidos as nombre_admin
                FROM estetica.Empleado
                WHERE id_empleado = @id AND rol = 'admin'
            `);
        return result.recordset[0];
    } catch (error) {
        console.error("Error en getAdminInfo:", error);
        throw error;
    }
};

// 2. Obtener todas las sucursales con su gerente
AdminModel.getSucursalesConGerente = async () => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .query(`
                SELECT 
                    s.id_sucursal,
                    s.nombre as nombre_sucursal,
                    s.direccion,
                    s.ciudad,
                    s.telefono,
                    e.id_empleado as id_gerente,
                    e.nombres + ' ' + e.apellidos as nombre_gerente
                FROM estetica.Sucursal s
                LEFT JOIN estetica.Empleado e ON s.id_sucursal = e.id_sucursal AND e.rol = 'gerente'
                ORDER BY s.nombre
            `);
        return result.recordset;
    } catch (error) {
        console.error("Error en getSucursalesConGerente:", error);
        throw error;
    }
};

// 3. Obtener empleados de una sucursal específica (excluyendo gerente)
AdminModel.getEmpleadosSucursal = async (idSucursal) => {
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

// 4. Obtener inventario de una sucursal específica
AdminModel.getInventarioSucursal = async (idSucursal) => {
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
                        WHEN i.stock_actual <= 0 THEN 'Agotado'
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

// 5. Obtener todos los gerentes
AdminModel.getGerentes = async () => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .query(`
                SELECT 
                    e.id_empleado,
                    e.cedula,
                    e.nombres,
                    e.apellidos,
                    e.telefono,
                    e.estado,
                    s.id_sucursal,
                    s.nombre as nombre_sucursal
                FROM estetica.Empleado e
                LEFT JOIN estetica.Sucursal s ON e.id_sucursal = s.id_sucursal
                WHERE e.rol = 'gerente'
                ORDER BY e.nombres
            `);
        return result.recordset;
    } catch (error) {
        console.error("Error en getGerentes:", error);
        throw error;
    }
};

// 6. Obtener sucursales sin gerente (para asignar)
AdminModel.getSucursalesSinGerente = async () => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .query(`
                SELECT s.id_sucursal, s.nombre
                FROM estetica.Sucursal s
                WHERE NOT EXISTS (
                    SELECT 1 FROM estetica.Empleado e 
                    WHERE e.id_sucursal = s.id_sucursal AND e.rol = 'gerente'
                )
                ORDER BY s.nombre
            `);
        return result.recordset;
    } catch (error) {
        console.error("Error en getSucursalesSinGerente:", error);
        throw error;
    }
};

// 7. Crear nuevo gerente
AdminModel.crearGerente = async (data) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id_sucursal', sql.Int, data.id_sucursal)
            .input('cedula', sql.Char(10), data.cedula)
            .input('nombres', sql.VarChar(60), data.nombres)
            .input('apellidos', sql.VarChar(60), data.apellidos)
            .input('telefono', sql.VarChar(10), data.telefono || null)
            .input('contrasena', sql.VarChar(100), data.contrasena)
            .query(`
                INSERT INTO estetica.Empleado (id_sucursal, cedula, nombres, apellidos, telefono, estado, rol, contrasena, especialidad)
                VALUES (@id_sucursal, @cedula, @nombres, @apellidos, @telefono, 'Activo', 'gerente', @contrasena, NULL);
                SELECT SCOPE_IDENTITY() as id;
            `);
        return result.recordset[0];
    } catch (error) {
        console.error("Error en crearGerente:", error);
        throw error;
    }
};

// 8. Eliminar gerente (despedir)
AdminModel.eliminarGerente = async (idEmpleado) => {
    try {
        const pool = await getConnection();
        
        // Verificar que sea gerente
        const checkGerente = await pool.request()
            .input('id_empleado', sql.Int, idEmpleado)
            .query(`SELECT rol FROM estetica.Empleado WHERE id_empleado = @id_empleado`);
        
        if (checkGerente.recordset.length === 0 || checkGerente.recordset[0].rol !== 'gerente') {
            throw new Error('El empleado no es un gerente');
        }

        // Eliminar horarios si existen
        await pool.request()
            .input('id_empleado', sql.Int, idEmpleado)
            .query(`DELETE FROM estetica.Horario_Empleado WHERE id_empleado = @id_empleado`);

        // Eliminar al gerente
        await pool.request()
            .input('id_empleado', sql.Int, idEmpleado)
            .query(`DELETE FROM estetica.Empleado WHERE id_empleado = @id_empleado`);

        return { success: true };
    } catch (error) {
        console.error("Error en eliminarGerente:", error);
        throw error;
    }
};

// =============================================
// FUNCIONES DE PROMOCIONES
// =============================================

// 9. Obtener todas las promociones con sus productos y servicios asociados
AdminModel.getPromociones = async () => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .query(`
                SELECT 
                    p.id_promocion,
                    p.nombre,
                    p.descripcion,
                    p.tipo_descuento,
                    p.valor_descuento,
                    p.fecha_inicio,
                    p.fecha_fin,
                    p.activa,
                    (SELECT COUNT(*) FROM estetica.Producto_Promocion pp WHERE pp.id_promocion = p.id_promocion) as total_productos,
                    (SELECT COUNT(*) FROM estetica.Servicio_Promocion sp WHERE sp.id_promocion = p.id_promocion) as total_servicios
                FROM estetica.Promocion p
                ORDER BY p.activa DESC, p.fecha_fin DESC
            `);
        return result.recordset;
    } catch (error) {
        console.error("Error en getPromociones:", error);
        throw error;
    }
};

// 10. Obtener detalle de una promoción (productos y servicios)
AdminModel.getPromocionDetalle = async (idPromocion) => {
    try {
        const pool = await getConnection();
        
        // Obtener productos de la promoción
        const productos = await pool.request()
            .input('id_promocion', sql.Int, idPromocion)
            .query(`
                SELECT p.id_producto, p.nombre, cp.nombre as categoria
                FROM estetica.Producto_Promocion pp
                JOIN estetica.Producto p ON pp.id_producto = p.id_producto
                JOIN estetica.Categoria_Producto cp ON p.id_categoria_producto = cp.id_categoria_producto
                WHERE pp.id_promocion = @id_promocion
            `);

        // Obtener servicios de la promoción
        const servicios = await pool.request()
            .input('id_promocion', sql.Int, idPromocion)
            .query(`
                SELECT s.id_servicio, s.nombre, cs.nombre as categoria
                FROM estetica.Servicio_Promocion sp
                JOIN estetica.Servicio s ON sp.id_servicio = s.id_servicio
                JOIN estetica.Categoria_Servicio cs ON s.id_categoria_servicio = cs.id_categoria_servicio
                WHERE sp.id_promocion = @id_promocion
            `);

        return {
            productos: productos.recordset,
            servicios: servicios.recordset
        };
    } catch (error) {
        console.error("Error en getPromocionDetalle:", error);
        throw error;
    }
};

// 11. Obtener todos los productos (para asignar a promoción)
AdminModel.getTodosProductos = async () => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .query(`
                SELECT p.id_producto, p.nombre, cp.nombre as categoria
                FROM estetica.Producto p
                JOIN estetica.Categoria_Producto cp ON p.id_categoria_producto = cp.id_categoria_producto
                ORDER BY cp.nombre, p.nombre
            `);
        return result.recordset;
    } catch (error) {
        console.error("Error en getTodosProductos:", error);
        throw error;
    }
};

// 12. Obtener todos los servicios (para asignar a promoción)
AdminModel.getTodosServicios = async () => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .query(`
                SELECT s.id_servicio, s.nombre, cs.nombre as categoria, s.precio_base
                FROM estetica.Servicio s
                JOIN estetica.Categoria_Servicio cs ON s.id_categoria_servicio = cs.id_categoria_servicio
                WHERE s.estado = 'Activo'
                ORDER BY cs.nombre, s.nombre
            `);
        return result.recordset;
    } catch (error) {
        console.error("Error en getTodosServicios:", error);
        throw error;
    }
};

// 13. Crear nueva promoción
AdminModel.crearPromocion = async (data) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('nombre', sql.VarChar(60), data.nombre)
            .input('descripcion', sql.VarChar(120), data.descripcion)
            .input('tipo_descuento', sql.VarChar(15), data.tipo_descuento)
            .input('valor_descuento', sql.Decimal(10, 2), data.valor_descuento)
            .input('fecha_inicio', sql.Date, data.fecha_inicio)
            .input('fecha_fin', sql.Date, data.fecha_fin)
            .input('activa', sql.Char(1), data.activa ? 'V' : 'F')
            .query(`
                INSERT INTO estetica.Promocion (nombre, descripcion, tipo_descuento, valor_descuento, fecha_inicio, fecha_fin, activa)
                VALUES (@nombre, @descripcion, @tipo_descuento, @valor_descuento, @fecha_inicio, @fecha_fin, @activa);
                SELECT SCOPE_IDENTITY() as id;
            `);
        return result.recordset[0];
    } catch (error) {
        console.error("Error en crearPromocion:", error);
        throw error;
    }
};

// 14. Asignar productos a promoción
AdminModel.asignarProductosPromocion = async (idPromocion, productosIds) => {
    try {
        const pool = await getConnection();
        
        // Eliminar asignaciones anteriores
        await pool.request()
            .input('id_promocion', sql.Int, idPromocion)
            .query(`DELETE FROM estetica.Producto_Promocion WHERE id_promocion = @id_promocion`);

        // Insertar nuevas asignaciones
        for (const idProducto of productosIds) {
            await pool.request()
                .input('id_producto', sql.Int, idProducto)
                .input('id_promocion', sql.Int, idPromocion)
                .query(`INSERT INTO estetica.Producto_Promocion (id_producto, id_promocion) VALUES (@id_producto, @id_promocion)`);
        }

        return { success: true };
    } catch (error) {
        console.error("Error en asignarProductosPromocion:", error);
        throw error;
    }
};

// 15. Asignar servicios a promoción
AdminModel.asignarServiciosPromocion = async (idPromocion, serviciosIds) => {
    try {
        const pool = await getConnection();
        
        // Eliminar asignaciones anteriores
        await pool.request()
            .input('id_promocion', sql.Int, idPromocion)
            .query(`DELETE FROM estetica.Servicio_Promocion WHERE id_promocion = @id_promocion`);

        // Insertar nuevas asignaciones
        for (const idServicio of serviciosIds) {
            await pool.request()
                .input('id_servicio', sql.Int, idServicio)
                .input('id_promocion', sql.Int, idPromocion)
                .query(`INSERT INTO estetica.Servicio_Promocion (id_servicio, id_promocion) VALUES (@id_servicio, @id_promocion)`);
        }

        return { success: true };
    } catch (error) {
        console.error("Error en asignarServiciosPromocion:", error);
        throw error;
    }
};

// 16. Activar/Desactivar promoción
AdminModel.togglePromocion = async (idPromocion) => {
    try {
        const pool = await getConnection();
        await pool.request()
            .input('id_promocion', sql.Int, idPromocion)
            .query(`
                UPDATE estetica.Promocion 
                SET activa = CASE WHEN activa = 'V' THEN 'F' ELSE 'V' END
                WHERE id_promocion = @id_promocion
            `);
        return { success: true };
    } catch (error) {
        console.error("Error en togglePromocion:", error);
        throw error;
    }
};

// 17. Eliminar promoción
AdminModel.eliminarPromocion = async (idPromocion) => {
    try {
        const pool = await getConnection();
        
        // Eliminar relaciones primero
        await pool.request()
            .input('id_promocion', sql.Int, idPromocion)
            .query(`DELETE FROM estetica.Producto_Promocion WHERE id_promocion = @id_promocion`);
        
        await pool.request()
            .input('id_promocion', sql.Int, idPromocion)
            .query(`DELETE FROM estetica.Servicio_Promocion WHERE id_promocion = @id_promocion`);

        // Eliminar promoción
        await pool.request()
            .input('id_promocion', sql.Int, idPromocion)
            .query(`DELETE FROM estetica.Promocion WHERE id_promocion = @id_promocion`);

        return { success: true };
    } catch (error) {
        console.error("Error en eliminarPromocion:", error);
        throw error;
    }
};

module.exports = AdminModel;