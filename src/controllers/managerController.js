const ManagerModel = require('../models/managerModel');

const controller = {};

// Obtener todos los datos del dashboard del gerente
controller.getDashboardData = async (req, res) => {
    const { id_gerente } = req.query;

    if (!id_gerente) {
        return res.status(400).json({ error: "Falta el ID del gerente" });
    }

    try {
        // 1. Obtener info del gerente
        const infoGerente = await ManagerModel.getGerenteInfo(id_gerente);

        if (!infoGerente) {
            return res.status(404).json({ error: "Gerente no encontrado" });
        }

        const idSucursal = infoGerente.id_sucursal;

        // 2. Obtener empleados de la sucursal
        const empleados = await ManagerModel.getEmpleadosSucursal(idSucursal);

        // 3. Obtener inventario de la sucursal
        const inventario = await ManagerModel.getInventarioSucursal(idSucursal);

        // 4. Responder con todo
        res.json({
            gerente: infoGerente,
            empleados,
            inventario
        });

    } catch (error) {
        console.error("Error en getDashboardData (manager):", error);
        res.status(500).json({ error: error.message });
    }
};

// Registrar nuevo empleado
// Registrar nuevo empleado
controller.registrarEmpleado = async (req, res) => {
    try {
        const { id_sucursal, cedula, nombres, apellidos, especialidad, telefono } = req.body;

        if (!id_sucursal || !cedula || !nombres || !apellidos || !especialidad) {
            return res.status(400).json({ error: "Faltan campos requeridos" });
        }

        const result = await ManagerModel.crearEmpleado({
            id_sucursal,
            cedula,
            nombres,
            apellidos,
            especialidad,
            telefono
        });

        res.json({ success: true, id_empleado: result.id });
    } catch (error) {
        console.error("Error en registrarEmpleado:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Despedir (eliminar) empleado
controller.despedirEmpleado = async (req, res) => {
    const { id_empleado } = req.params;

    try {
        await ManagerModel.eliminarEmpleado(id_empleado);
        res.json({ success: true });
    } catch (error) {
        console.error("Error en despedirEmpleado:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = controller;