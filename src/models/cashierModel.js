const { getConnection, sql } = require('../config/db');

const CashierModel = {};

// 1. Obtener Info del Cajero y su Sucursal
CashierModel.getCajeroInfo = async (idEmpleado) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, idEmpleado)
            .query(`
                SELECT 
                    e.id_empleado,
                    e.nombres + ' ' + e.apellidos as nombre_cajero,
                    s.id_sucursal,
                    s.nombre as nombre_sucursal
                FROM estetica.Empleado e
                JOIN estetica.Sucursal s ON e.id_sucursal = s.id_sucursal
                WHERE e.id_empleado = @id
            `);
        return result.recordset[0];
    } catch (error) {
        console.error("Error en getCajeroInfo:", error);
        throw error;
    }
};

// 2. Obtener Citas Pendientes con información de servicio y promociones
CashierModel.getCitasPendientes = async (idSucursal) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id_sucursal', sql.Int, idSucursal)
            .query(`
                SELECT 
                    c.id_cita, 
                    ISNULL(CONVERT(varchar(5), c.hora, 108), '00:00') as hora,
                    cl.id_cliente,
                    cl.nombres + ' ' + cl.apellidos as cliente,
                    cl.cedula,
                    e.nombres + ' ' + e.apellidos as empleado,
                    e.especialidad,
                    
                    -- Buscar el servicio relacionado a la especialidad
                    ISNULL(s.id_servicio, 1) as id_servicio,
                    ISNULL(s.nombre, e.especialidad) as servicio_nombre,
                    ISNULL(s.precio_base, 20.00) as precio_base,
                    
                    -- Buscar promoción activa para este servicio
                    prom.id_promocion,
                    prom.nombre as promocion_nombre,
                    prom.tipo_descuento,
                    prom.valor_descuento

                FROM estetica.Cita c
                JOIN estetica.Cliente cl ON c.id_cliente = cl.id_cliente
                JOIN estetica.Empleado e ON c.id_empleado = e.id_empleado
                LEFT JOIN estetica.Servicio s ON s.nombre LIKE '%' + e.especialidad + '%' AND s.estado = 'Activo'
                LEFT JOIN estetica.Servicio_Promocion sp ON s.id_servicio = sp.id_servicio
                LEFT JOIN estetica.Promocion prom ON sp.id_promocion = prom.id_promocion 
                    AND prom.activa = 'V' 
                    AND GETDATE() BETWEEN prom.fecha_inicio AND prom.fecha_fin
                WHERE c.id_sucursal = @id_sucursal AND c.estado = 'Pendiente'
                ORDER BY c.hora
            `);
        return result.recordset;
    } catch (error) {
        console.error("Error en getCitasPendientes:", error);
        throw error;
    }
};

// 3. Obtener Productos con Stock y Promociones activas
CashierModel.getProductos = async (idSucursal) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id_sucursal', sql.Int, idSucursal)
            .query(`
                SELECT 
                    p.id_producto, 
                    p.nombre,
                    cp.nombre as categoria,
                    CAST(p.precio_compra * 1.30 AS DECIMAL(10,2)) as precio_base,
                    i.stock_actual as stock,
                    
                    -- Buscar promoción activa para este producto
                    prom.id_promocion,
                    prom.nombre as promocion_nombre,
                    prom.tipo_descuento,
                    prom.valor_descuento

                FROM estetica.Producto p
                JOIN estetica.Categoria_Producto cp ON p.id_categoria_producto = cp.id_categoria_producto
                JOIN estetica.Inventario_Sucursal i ON p.id_producto = i.id_producto
                LEFT JOIN estetica.Producto_Promocion pp ON p.id_producto = pp.id_producto
                LEFT JOIN estetica.Promocion prom ON pp.id_promocion = prom.id_promocion 
                    AND prom.activa = 'V' 
                    AND GETDATE() BETWEEN prom.fecha_inicio AND prom.fecha_fin
                WHERE i.id_sucursal = @id_sucursal 
                  AND i.stock_actual > 0
                ORDER BY cp.nombre, p.nombre
            `);
        return result.recordset;
    } catch (error) {
        console.error("Error en getProductos:", error);
        throw error;
    }
};

// 4. Obtener todos los servicios activos con promociones
CashierModel.getServicios = async () => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .query(`
                SELECT 
                    s.id_servicio,
                    s.nombre,
                    cs.nombre as categoria,
                    s.precio_base,
                    s.duracion_minutos,
                    
                    -- Buscar promoción activa
                    prom.id_promocion,
                    prom.nombre as promocion_nombre,
                    prom.tipo_descuento,
                    prom.valor_descuento

                FROM estetica.Servicio s
                JOIN estetica.Categoria_Servicio cs ON s.id_categoria_servicio = cs.id_categoria_servicio
                LEFT JOIN estetica.Servicio_Promocion sp ON s.id_servicio = sp.id_servicio
                LEFT JOIN estetica.Promocion prom ON sp.id_promocion = prom.id_promocion 
                    AND prom.activa = 'V' 
                    AND GETDATE() BETWEEN prom.fecha_inicio AND prom.fecha_fin
                WHERE s.estado = 'Activo'
                ORDER BY cs.nombre, s.nombre
            `);
        return result.recordset;
    } catch (error) {
        console.error("Error en getServicios:", error);
        throw error;
    }
};

// 5. PROCESAR VENTA COMPLETA (con descuentos aplicados)
CashierModel.procesarVentaCompleta = async (data) => {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        let idCliente = data.id_cliente;

        // A. Crear/Buscar Cliente
        if (!idCliente) {
            const reqCheck = new sql.Request(transaction);
            const check = await reqCheck.input('cedula', sql.VarChar(10), data.cedula_cliente)
                .query("SELECT id_cliente FROM estetica.Cliente WHERE cedula = @cedula");
            
            if (check.recordset.length > 0) {
                idCliente = check.recordset[0].id_cliente;
            } else {
                const reqIns = new sql.Request(transaction);
                const nombres = data.nombre_cliente.split(' ');
                const resIns = await reqIns
                    .input('cedula', sql.Char(10), data.cedula_cliente)
                    .input('nombres', sql.VarChar(60), nombres[0] || 'Cliente')
                    .input('apellidos', sql.VarChar(60), nombres.slice(1).join(' ') || 'General')
                    .input('telefono', sql.VarChar(10), data.telefono || null)
                    .input('correo', sql.VarChar(30), data.correo || null)
                    .query(`
                        INSERT INTO estetica.Cliente (cedula, nombres, apellidos, telefono, correo) 
                        VALUES (@cedula, @nombres, @apellidos, @telefono, @correo); 
                        SELECT SCOPE_IDENTITY() as id;
                    `);
                idCliente = resIns.recordset[0].id;
            }
        }

        // B. Crear Venta
        const reqVenta = new sql.Request(transaction);
        const resVenta = await reqVenta
            .input('id_sucursal', sql.Int, data.id_sucursal)
            .input('id_empleado', sql.Int, data.id_cajero)
            .query(`
                INSERT INTO estetica.Venta (id_sucursal, id_empleado, fecha_venta, total) 
                VALUES (@id_sucursal, @id_empleado, CAST(GETDATE() AS DATE), 0); 
                SELECT SCOPE_IDENTITY() as id;
            `);
        const idVenta = resVenta.recordset[0].id;

        // C. Procesar Productos
        const productos = data.items.filter(i => i.type === 'PRODUCTO');
        for (const prod of productos) {
            const reqDet = new sql.Request(transaction);
            await reqDet
                .input('id_venta', sql.Int, idVenta)
                .input('id_prod', sql.Int, prod.id)
                .input('cant', sql.Int, prod.cantidad)
                .input('precio', sql.Decimal(10,2), prod.precio_original)
                .input('descuento', sql.Decimal(10,2), prod.descuento_aplicado || 0)
                .input('sub', sql.Decimal(10,2), prod.subtotal)
                .query(`
                    INSERT INTO estetica.Detalle_Venta (id_venta, id_producto, cantidad, precio_unitario, descuento, subtotal) 
                    VALUES (@id_venta, @id_prod, @cant, @precio, @descuento, @sub)
                `);
        }

        // D. Crear Factura
        const numFac = `F-${Date.now()}`;
        const reqFac = new sql.Request(transaction);
        const resFac = await reqFac
            .input('id_venta', sql.Int, idVenta)
            .input('id_cli', sql.Int, idCliente)
            .input('id_suc', sql.Int, data.id_sucursal)
            .input('num', sql.VarChar(20), numFac)
            .query(`
                INSERT INTO estetica.Factura (id_venta, id_cliente, id_sucursal, num_factura, fecha_emision, subtotal, iva, total) 
                VALUES (@id_venta, @id_cli, @id_suc, @num, CAST(GETDATE() AS DATE), 0, 0, 0); 
                SELECT SCOPE_IDENTITY() as id;
            `);
        const idFactura = resFac.recordset[0].id;

        // E. Procesar Servicios
        const servicios = data.items.filter(i => i.type === 'SERVICIO');
        for (const serv of servicios) {
            const reqServ = new sql.Request(transaction);
            await reqServ
                .input('id_fac', sql.Int, idFactura)
                .input('id_serv', sql.Int, serv.id_servicio)
                .input('precio', sql.Decimal(10,2), serv.precio_original)
                .input('descuento', sql.Decimal(10,2), serv.descuento_aplicado || 0)
                .input('sub', sql.Decimal(10,2), serv.subtotal)
                .query(`
                    INSERT INTO estetica.Servicio_Factura (id_factura, id_servicio, cantidad, precio_unitario, descuento, subtotal) 
                    VALUES (@id_fac, @id_serv, 1, @precio, @descuento, @sub)
                `);
            
            // Actualizar estado de la cita si viene de una cita
            if (serv.id_cita) {
                const reqUpdCita = new sql.Request(transaction);
                await reqUpdCita
                    .input('id_cita', sql.Int, serv.id_cita)
                    .query("UPDATE estetica.Cita SET estado = 'Atendida' WHERE id_cita = @id_cita");
            }
        }

        // F. Calcular totales finales
        const subtotalFinal = data.subtotal;
        const ivaFinal = data.iva;
        const totalFinal = data.total;

        // Actualizar Venta
        const reqUpdV = new sql.Request(transaction);
        await reqUpdV
            .input('id', sql.Int, idVenta)
            .input('total', sql.Decimal(10,2), subtotalFinal)
            .query("UPDATE estetica.Venta SET total = @total WHERE id_venta = @id");

        // Actualizar Factura
        const reqUpdF = new sql.Request(transaction);
        await reqUpdF
            .input('id', sql.Int, idFactura)
            .input('sub', sql.Decimal(10,2), subtotalFinal)
            .input('iva', sql.Decimal(10,2), ivaFinal)
            .input('tot', sql.Decimal(10,2), totalFinal)
            .query("UPDATE estetica.Factura SET subtotal = @sub, iva = @iva, total = @tot WHERE id_factura = @id");

        // G. Registrar Pago
        const reqPago = new sql.Request(transaction);
        await reqPago
            .input('id', sql.Int, idFactura)
            .input('tipo', sql.VarChar(15), data.metodo_pago)
            .input('monto', sql.Decimal(10,2), totalFinal)
            .query("INSERT INTO estetica.Pago (id_factura, fecha_pago, tipo_pago, monto) VALUES (@id, CAST(GETDATE() AS DATE), @tipo, @monto)");

        await transaction.commit();
        return { success: true, id_factura: idFactura, num_factura: numFac, total: totalFinal };

    } catch (error) {
        await transaction.rollback();
        console.error("Error Venta:", error);
        throw error;
    }
};

module.exports = CashierModel;