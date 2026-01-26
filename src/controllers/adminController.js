const AdminModel = require('../models/adminModel');

const controller = {};

// Obtener datos iniciales del dashboard
controller.getDashboardData = async (req, res) => {
    const { id_admin } = req.query;

    if (!id_admin) {
        return res.status(400).json({ error: "Falta el ID del administrador" });
    }

    try {
        const infoAdmin = await AdminModel.getAdminInfo(id_admin);

        if (!infoAdmin) {
            return res.status(404).json({ error: "Administrador no encontrado" });
        }

        const sucursales = await AdminModel.getSucursalesConGerente();
        const gerentes = await AdminModel.getGerentes();
        const sucursalesSinGerente = await AdminModel.getSucursalesSinGerente();

        res.json({
            admin: infoAdmin,
            sucursales,
            gerentes,
            sucursalesSinGerente
        });

    } catch (error) {
        console.error("Error en getDashboardData (admin):", error);
        res.status(500).json({ error: error.message });
    }
};

// Obtener empleados de una sucursal
controller.getEmpleadosSucursal = async (req, res) => {
    const { id_sucursal } = req.query;

    if (!id_sucursal) {
        return res.status(400).json({ error: "Falta el ID de la sucursal" });
    }

    try {
        const empleados = await AdminModel.getEmpleadosSucursal(id_sucursal);
        res.json(empleados);
    } catch (error) {
        console.error("Error en getEmpleadosSucursal:", error);
        res.status(500).json({ error: error.message });
    }
};

// Obtener inventario de una sucursal
controller.getInventarioSucursal = async (req, res) => {
    const { id_sucursal } = req.query;

    if (!id_sucursal) {
        return res.status(400).json({ error: "Falta el ID de la sucursal" });
    }

    try {
        const inventario = await AdminModel.getInventarioSucursal(id_sucursal);
        res.json(inventario);
    } catch (error) {
        console.error("Error en getInventarioSucursal:", error);
        res.status(500).json({ error: error.message });
    }
};

// Crear nuevo gerente
controller.crearGerente = async (req, res) => {
    try {
        const { id_sucursal, cedula, nombres, apellidos, telefono, contrasena } = req.body;

        if (!id_sucursal || !cedula || !nombres || !apellidos || !contrasena) {
            return res.status(400).json({ error: "Faltan campos requeridos" });
        }

        const result = await AdminModel.crearGerente({
            id_sucursal,
            cedula,
            nombres,
            apellidos,
            telefono,
            contrasena
        });

        res.json({ success: true, id_gerente: result.id });
    } catch (error) {
        console.error("Error en crearGerente:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Despedir gerente
controller.despedirGerente = async (req, res) => {
    const { id_gerente } = req.params;

    try {
        await AdminModel.eliminarGerente(id_gerente);
        res.json({ success: true });
    } catch (error) {
        console.error("Error en despedirGerente:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// =============================================
// CONTROLADORES DE PROMOCIONES
// =============================================

// Obtener todas las promociones
controller.getPromociones = async (req, res) => {
    try {
        const promociones = await AdminModel.getPromociones();
        res.json(promociones);
    } catch (error) {
        console.error("Error en getPromociones:", error);
        res.status(500).json({ error: error.message });
    }
};

// Obtener detalle de una promoción
controller.getPromocionDetalle = async (req, res) => {
    const { id_promocion } = req.params;

    try {
        const detalle = await AdminModel.getPromocionDetalle(id_promocion);
        res.json(detalle);
    } catch (error) {
        console.error("Error en getPromocionDetalle:", error);
        res.status(500).json({ error: error.message });
    }
};

// Obtener productos y servicios para asignar
controller.getItemsParaPromocion = async (req, res) => {
    try {
        const productos = await AdminModel.getTodosProductos();
        const servicios = await AdminModel.getTodosServicios();
        res.json({ productos, servicios });
    } catch (error) {
        console.error("Error en getItemsParaPromocion:", error);
        res.status(500).json({ error: error.message });
    }
};

// Crear nueva promoción
controller.crearPromocion = async (req, res) => {
    try {
        const { nombre, descripcion, tipo_descuento, valor_descuento, fecha_inicio, fecha_fin, activa, productos, servicios } = req.body;

        if (!nombre || !tipo_descuento || !valor_descuento || !fecha_inicio || !fecha_fin) {
            return res.status(400).json({ error: "Faltan campos requeridos" });
        }

        // Crear la promoción
        const result = await AdminModel.crearPromocion({
            nombre,
            descripcion,
            tipo_descuento,
            valor_descuento,
            fecha_inicio,
            fecha_fin,
            activa
        });

        const idPromocion = result.id;

        // Asignar productos si hay
        if (productos && productos.length > 0) {
            await AdminModel.asignarProductosPromocion(idPromocion, productos);
        }

        // Asignar servicios si hay
        if (servicios && servicios.length > 0) {
            await AdminModel.asignarServiciosPromocion(idPromocion, servicios);
        }

        res.json({ success: true, id_promocion: idPromocion });
    } catch (error) {
        console.error("Error en crearPromocion:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Activar/Desactivar promoción
controller.togglePromocion = async (req, res) => {
    const { id_promocion } = req.params;

    try {
        await AdminModel.togglePromocion(id_promocion);
        res.json({ success: true });
    } catch (error) {
        console.error("Error en togglePromocion:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Eliminar promoción
controller.eliminarPromocion = async (req, res) => {
    const { id_promocion } = req.params;

    try {
        await AdminModel.eliminarPromocion(id_promocion);
        res.json({ success: true });
    } catch (error) {
        console.error("Error en eliminarPromocion:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = controller;