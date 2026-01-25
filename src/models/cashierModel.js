const { getConnection, sql } = require('../config/db');

const CashierModel = {};

// 1. Obtener Info del Cajero y su Sucursal (Para el Header)
CashierModel.getCajeroInfo = async (idEmpleado) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, idEmpleado)
            .query(`
                SELECT 
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

// 2. Obtener Citas Pendientes (Filtradas por Sucursal)
CashierModel.getCitasPendientes = async (idSucursal) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id_sucursal', sql.Int, idSucursal)
            .query(`
                SELECT 
                    c.id_cita, 
                    -- Formateo seguro de hora
                    ISNULL(CONVERT(varchar(5), c.hora, 108), '00:00') as hora,
                    
                    -- Cliente
                    cl.nombres + ' ' + cl.apellidos as cliente,
                    cl.cedula,
                    
                    -- Empleado / Servicio
                    e.nombres + ' ' + e.apellidos as empleado,
                    ISNULL(e.especialidad, 'Servicio Gral') as servicio_nombre,
                    
                    -- Calculamos precio estimado al vuelo para evitar errores
                    CASE 
                        WHEN e.especialidad = 'Corte' THEN 15.00
                        WHEN e.especialidad = 'Color' THEN 45.00
                        WHEN e.especialidad = 'Manicure' THEN 10.00
                        WHEN e.especialidad = 'Depilacion Laser' THEN 30.00
                        WHEN e.especialidad = 'Limpieza Facial' THEN 25.00
                        ELSE 20.00 
                    END as precio,
                    
                    -- ID Servicio simulado (o real si existiera la tabla vinculada perfectamente)
                    1 as id_servicio_real

                FROM estetica.Cita c
                JOIN estetica.Cliente cl ON c.id_cliente = cl.id_cliente
                JOIN estetica.Empleado e ON c.id_empleado = e.id_empleado
                WHERE c.id_sucursal = @id_sucursal AND c.estado = 'Pendiente'
            `);
        return result.recordset;
    } catch (error) {
        console.error("Error en getCitasPendientes:", error);
        throw error; // Lanzamos el error para ver el log
    }
};

// 3. Obtener Productos con Stock (De la Sucursal específica)
CashierModel.getProductos = async (idSucursal) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id_sucursal', sql.Int, idSucursal)
            .query(`
                SELECT 
                    p.id_producto, 
                    p.nombre, 
                    -- Si no tienes precio_venta, calculamos margen del 30% sobre costo
                    CAST(p.precio_compra * 1.30 AS DECIMAL(10,2)) as precio,
                    i.stock_actual as stock
                FROM estetica.Producto p
                JOIN estetica.Inventario_Sucursal i ON p.id_producto = i.id_producto
                WHERE i.id_sucursal = @id_sucursal 
                  AND i.stock_actual > 0
            `);
        return result.recordset;
    } catch (error) {
        console.error("Error en getProductos:", error);
        throw error;
    }
};

// 4. PROCESAR VENTA COMPLETA
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
                const resIns = await reqIns
                    .input('cedula', sql.Char(10), data.cedula_cliente)
                    .input('nombres', sql.VarChar(60), data.nombre_cliente.split(' ')[0] || 'X')
                    .input('apellidos', sql.VarChar(60), data.nombre_cliente.split(' ')[1] || 'X')
                    .input('telefono', sql.VarChar(10), data.telefono || null)
                    .input('correo', sql.VarChar(30), data.correo || null)
                    .query(`INSERT INTO estetica.Cliente (cedula, nombres, apellidos, telefono, correo) VALUES (@cedula, @nombres, @apellidos, @telefono, @correo); SELECT SCOPE_IDENTITY() as id;`);
                idCliente = resIns.recordset[0].id;
            }
        }

        // B. Crear Venta
        const reqVenta = new sql.Request(transaction);
        const resVenta = await reqVenta
            .input('id_sucursal', sql.Int, data.id_sucursal)
            .input('id_empleado', sql.Int, data.id_cajero)
            .input('total', sql.Decimal(10,2), 0)
            .query(`INSERT INTO estetica.Venta (id_sucursal, id_empleado, fecha_venta, total) VALUES (@id_sucursal, @id_empleado, CAST(GETDATE() AS DATE), @total); SELECT SCOPE_IDENTITY() as id;`);
        const idVenta = resVenta.recordset[0].id;

        // C. Detalles Productos
        const productos = data.items.filter(i => i.type === 'PRODUCTO');
        let subtotalProds = 0;
        for (const prod of productos) {
            const reqDet = new sql.Request(transaction);
            await reqDet
                .input('id_venta', sql.Int, idVenta).input('id_prod', sql.Int, prod.id).input('cant', sql.Int, prod.cantidad)
                .input('precio', sql.Decimal(10,2), prod.precio).input('sub', sql.Decimal(10,2), prod.precio * prod.cantidad)
                .query(`INSERT INTO estetica.Detalle_Venta (id_venta, id_producto, cantidad, precio_unitario, descuento, subtotal) VALUES (@id_venta, @id_prod, @cant, @precio, 0, @sub)`);
            subtotalProds += (prod.precio * prod.cantidad);
        }

        // D. Crear Factura
        const numFac = `F-${Date.now()}`;
        const reqFac = new sql.Request(transaction);
        const resFac = await reqFac
            .input('id_venta', sql.Int, idVenta).input('id_cli', sql.Int, idCliente).input('id_suc', sql.Int, data.id_sucursal)
            .input('num', sql.VarChar(20), numFac).input('sub', sql.Decimal(10,2), 0).input('iva', sql.Decimal(10,2), 0).input('tot', sql.Decimal(10,2), 0)
            .query(`INSERT INTO estetica.Factura (id_venta, id_cliente, id_sucursal, num_factura, fecha_emision, subtotal, iva, total) VALUES (@id_venta, @id_cli, @id_suc, @num, CAST(GETDATE() AS DATE), @sub, @iva, @tot); SELECT SCOPE_IDENTITY() as id;`);
        const idFactura = resFac.recordset[0].id;

        // E. Detalles Servicios
        const servicios = data.items.filter(i => i.type === 'SERVICIO');
        let subtotalServs = 0;
        for (const serv of servicios) {
            const reqServ = new sql.Request(transaction);
            await reqServ
                .input('id_fac', sql.Int, idFactura).input('id_serv', sql.Int, 1).input('precio', sql.Decimal(10,2), serv.precio).input('sub', sql.Decimal(10,2), serv.precio)
                .query(`INSERT INTO estetica.Servicio_Factura (id_factura, id_servicio, cantidad, precio_unitario, descuento, subtotal) VALUES (@id_fac, @id_serv, 1, @precio, 0, @sub)`);
            
            const reqUpdCita = new sql.Request(transaction);
            await reqUpdCita.input('id_cita', sql.Int, serv.id).query("UPDATE estetica.Cita SET estado = 'Atendida' WHERE id_cita = @id_cita");
            subtotalServs += serv.precio;
        }

        // F. Actualizar Totales y Pago
        const subTotal = subtotalProds + subtotalServs;
        const ivaTotal = subTotal * 0.12;
        const totalFin = subTotal + ivaTotal;

        const reqUpdF = new sql.Request(transaction);
        await reqUpdF.input('id', sql.Int, idFactura).input('sub', sql.Decimal(10,2), subTotal).input('iva', sql.Decimal(10,2), ivaTotal).input('tot', sql.Decimal(10,2), totalFin)
            .query("UPDATE estetica.Factura SET subtotal = @sub, iva = @iva, total = @tot WHERE id_factura = @id");

        const reqPago = new sql.Request(transaction);
        await reqPago.input('id', sql.Int, idFactura).input('tipo', sql.VarChar(15), data.metodo_pago).input('monto', sql.Decimal(10,2), totalFin)
            .query("INSERT INTO estetica.Pago (id_factura, fecha_pago, tipo_pago, monto) VALUES (@id, CAST(GETDATE() AS DATE), @tipo, @monto)");

        await transaction.commit();
        return { success: true, id_factura: idFactura, total: totalFin };

    } catch (error) {
        await transaction.rollback();
        console.error("Error Venta:", error);
        throw error;
    }
};

module.exports = CashierModel;