const { getConnection, sql } = require('../config/db');
const crypto = require('crypto');

const CashierModel = {};

/**
 * Ejecuta un Stored Procedure dentro de una transacción (o request normal).
 */
async function execSp(txOrPool, spName, { inputs = [], outputs = [] } = {}) {
    const req = new sql.Request(txOrPool);
    for (const { name, type, value } of inputs) req.input(name, type, value);
    for (const { name, type } of outputs) req.output(name, type);
    const res = await req.execute(spName);
    return { recordsets: res.recordsets, output: res.output };
}

/**
 * Ejecuta una query parametrizada dentro de una transacción (o pool).
 */
async function execQuery(txOrPool, queryText, inputs = []) {
    const req = new sql.Request(txOrPool);
    for (const { name, type, value } of inputs) req.input(name, type, value);
    return req.query(queryText);
}

function buildFacturaNumber() {
    return `F-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
}

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
          
          ISNULL(s.id_servicio, 1) as id_servicio,
          ISNULL(s.nombre, e.especialidad) as servicio_nombre,
          ISNULL(s.precio_base, 20.00) as precio_base,
          
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

// 5. PROCESAR VENTA COMPLETA (manteniendo lógica actual, usando SP donde NO rompe el flujo)
CashierModel.procesarVentaCompleta = async (data) => {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        let idCliente = data.id_cliente;

        // A. Crear/Buscar Cliente (se mantiene inline)
        if (!idCliente) {
            const check = await execQuery(transaction,
                "SELECT id_cliente FROM estetica.Cliente WHERE cedula = @cedula",
                [{ name: 'cedula', type: sql.VarChar(10), value: data.cedula_cliente }]
            );

            if (check.recordset.length > 0) {
                idCliente = check.recordset[0].id_cliente;
            } else {
                const nombres = String(data.nombre_cliente || '').trim().split(/\s+/).filter(Boolean);
                const resIns = await execQuery(transaction, `
          INSERT INTO estetica.Cliente (cedula, nombres, apellidos, telefono, correo) 
          VALUES (@cedula, @nombres, @apellidos, @telefono, @correo); 
          SELECT SCOPE_IDENTITY() as id;
        `, [
                    { name: 'cedula', type: sql.Char(10), value: data.cedula_cliente },
                    { name: 'nombres', type: sql.VarChar(60), value: nombres[0] || 'Cliente' },
                    { name: 'apellidos', type: sql.VarChar(60), value: (nombres.slice(1).join(' ') || 'General') },
                    { name: 'telefono', type: sql.VarChar(10), value: data.telefono || null },
                    { name: 'correo', type: sql.VarChar(30), value: data.correo || null },
                ]);
                idCliente = resIns.recordset[0].id;
            }
        }

        // B. Crear Venta
        // Nota: sp_registrar_venta_simple NO devuelve id_venta en tu backup actual.
        // Para NO romper nada, mantenemos el INSERT inline (misma lógica que ya te funciona).
        const resVenta = await execQuery(transaction, `
      INSERT INTO estetica.Venta (id_sucursal, id_empleado, fecha_venta, total) 
      VALUES (@id_sucursal, @id_empleado, CAST(GETDATE() AS DATE), 0); 
      SELECT SCOPE_IDENTITY() as id;
    `, [
            { name: 'id_sucursal', type: sql.Int, value: data.id_sucursal },
            { name: 'id_empleado', type: sql.Int, value: data.id_cajero },
        ]);
        const idVenta = resVenta.recordset[0].id;

        // C. Procesar Productos
        // Por defecto se mantiene inline para respetar tu subtotal calculado en app.
        // Si activas USE_SP_DETALLE=1, usará sp_agregar_detalle_venta (cuidado: subtotal=0 y trigger recalcula).
        const useSpDetalle = String(process.env.USE_SP_DETALLE || '').trim() === '1';

        const productos = (data.items || []).filter(i => i.type === 'PRODUCTO');
        for (const prod of productos) {
            if (useSpDetalle) {
                await execSp(transaction, 'estetica.sp_agregar_detalle_venta', {
                    inputs: [
                        { name: 'id_venta', type: sql.Int, value: idVenta },
                        { name: 'id_producto', type: sql.Int, value: prod.id },
                        { name: 'cantidad', type: sql.Int, value: prod.cantidad },
                        { name: 'precio_unitario', type: sql.Decimal(10, 2), value: prod.precio_original },
                        { name: 'descuento', type: sql.Decimal(10, 2), value: prod.descuento_aplicado || 0 },
                    ],
                });
            } else {
                await execQuery(transaction, `
          INSERT INTO estetica.Detalle_Venta (id_venta, id_producto, cantidad, precio_unitario, descuento, subtotal) 
          VALUES (@id_venta, @id_prod, @cant, @precio, @descuento, @sub)
        `, [
                    { name: 'id_venta', type: sql.Int, value: idVenta },
                    { name: 'id_prod', type: sql.Int, value: prod.id },
                    { name: 'cant', type: sql.Int, value: prod.cantidad },
                    { name: 'precio', type: sql.Decimal(10, 2), value: prod.precio_original },
                    { name: 'descuento', type: sql.Decimal(10, 2), value: prod.descuento_aplicado || 0 },
                    { name: 'sub', type: sql.Decimal(10, 2), value: prod.subtotal },
                ]);
            }
        }

        // D. Crear Factura (usando SP sp_emitir_factura con OUTPUT, no rompe tu flujo)
        const numFac = buildFacturaNumber();

        const { output: facOut } = await execSp(transaction, 'estetica.sp_emitir_factura', {
            inputs: [
                { name: 'id_venta', type: sql.Int, value: idVenta },
                { name: 'id_cliente', type: sql.Int, value: idCliente },
                { name: 'num_factura', type: sql.VarChar(20), value: numFac },
            ],
            outputs: [
                { name: 'id_factura', type: sql.Int },
            ],
        });
        const idFactura = facOut.id_factura;

        // E. Procesar Servicios (se mantiene inline)
        const servicios = (data.items || []).filter(i => i.type === 'SERVICIO');
        for (const serv of servicios) {
            await execQuery(transaction, `
        INSERT INTO estetica.Servicio_Factura (id_factura, id_servicio, cantidad, precio_unitario, descuento, subtotal) 
        VALUES (@id_fac, @id_serv, 1, @precio, @descuento, @sub)
      `, [
                { name: 'id_fac', type: sql.Int, value: idFactura },
                { name: 'id_serv', type: sql.Int, value: serv.id_servicio },
                { name: 'precio', type: sql.Decimal(10, 2), value: serv.precio_original },
                { name: 'descuento', type: sql.Decimal(10, 2), value: serv.descuento_aplicado || 0 },
                { name: 'sub', type: sql.Decimal(10, 2), value: serv.subtotal },
            ]);

            if (serv.id_cita) {
                await execQuery(transaction,
                    "UPDATE estetica.Cita SET estado = 'Atendida' WHERE id_cita = @id_cita",
                    [{ name: 'id_cita', type: sql.Int, value: serv.id_cita }]
                );
            }
        }

        // F. Calcular totales finales (se mantiene tu fuente de verdad actual)
        const subtotalFinal = data.subtotal;
        const ivaFinal = data.iva;
        const totalFinal = data.total;

        // Actualizar Venta
        await execQuery(transaction,
            "UPDATE estetica.Venta SET total = @total WHERE id_venta = @id",
            [
                { name: 'id', type: sql.Int, value: idVenta },
                { name: 'total', type: sql.Decimal(10, 2), value: subtotalFinal },
            ]
        );

        // Actualizar Factura
        await execQuery(transaction,
            "UPDATE estetica.Factura SET subtotal = @sub, iva = @iva, total = @tot WHERE id_factura = @id",
            [
                { name: 'id', type: sql.Int, value: idFactura },
                { name: 'sub', type: sql.Decimal(10, 2), value: subtotalFinal },
                { name: 'iva', type: sql.Decimal(10, 2), value: ivaFinal },
                { name: 'tot', type: sql.Decimal(10, 2), value: totalFinal },
            ]
        );

        // G. Registrar Pago (usando SP sp_registrar_pago)
        await execSp(transaction, 'estetica.sp_registrar_pago', {
            inputs: [
                { name: 'id_factura', type: sql.Int, value: idFactura },
                { name: 'tipo_pago', type: sql.VarChar(15), value: data.metodo_pago },
                { name: 'monto', type: sql.Decimal(10, 2), value: totalFinal },
            ],
        });

        await transaction.commit();
        return { success: true, id_factura: idFactura, num_factura: numFac, total: totalFinal };

    } catch (error) {
        try { await transaction.rollback(); } catch (_) { }
        console.error("Error Venta:", error);
        throw error;
    }
};

module.exports = CashierModel;