const CashierModel = require('../models/cashierModel');

const controller = {};

// Obtener datos del Dashboard
controller.getDashboardData = async (req, res) => {
    const { id_cajero } = req.query;

    if (!id_cajero) {
        return res.status(400).json({ error: "Falta el ID del cajero" });
    }

    try {
        // 1. Info del cajero
        const infoCajero = await CashierModel.getCajeroInfo(id_cajero);

        if (!infoCajero) {
            return res.status(404).json({ error: "Cajero no encontrado" });
        }

        const idSucursal = infoCajero.id_sucursal;

        // 2. Citas pendientes con promociones
        const citas = await CashierModel.getCitasPendientes(idSucursal);

        // 3. Productos con promociones
        const productos = await CashierModel.getProductos(idSucursal);

        // 4. Servicios con promociones (para venta directa)
        const servicios = await CashierModel.getServicios();

        res.json({
            cajero: infoCajero,
            citas,
            productos,
            servicios
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

// Procesar venta
controller.processSale = async (req, res) => {
    try {
        const result = await CashierModel.procesarVentaCompleta(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = controller;