const CashierModel = require('../models/cashierModel');

const controller = {};

// Obtener datos del Dashboard (Nombre Cajero, Sucursal, Citas, Productos)
controller.getDashboardData = async (req, res) => {
    const { id_cajero } = req.query;

    if (!id_cajero) {
        return res.status(400).json({ error: "Falta el ID del cajero" });
    }

    try {
        // 1. Averiguar quién es el cajero y dónde trabaja
        const infoCajero = await CashierModel.getCajeroInfo(id_cajero);

        if (!infoCajero) {
            return res.status(404).json({ error: "Cajero no encontrado" });
        }

        const idSucursal = infoCajero.id_sucursal;

        // 2. Cargar datos de ESA sucursal
        const citas = await CashierModel.getCitasPendientes(idSucursal);
        const productos = await CashierModel.getProductos(idSucursal);

        // 3. Responder con todo el paquete
        res.json({
            cajero: infoCajero, // { nombre_cajero, id_sucursal, nombre_sucursal }
            citas,
            productos
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

controller.processSale = async (req, res) => {
    try {
        const result = await CashierModel.procesarVentaCompleta(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = controller;