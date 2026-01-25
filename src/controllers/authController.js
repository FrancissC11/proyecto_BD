const authModel = require('../models/authModel');
const path = require('path');

const controller = {};

controller.showLogin = (req, res) => {
    res.sendFile(path.join(__dirname, '../../src/views/login.html'));
};

controller.showRegister = (req, res) => {
    res.sendFile(path.join(__dirname, '../../src/views/register.html'));
};

controller.register = async (req, res) => {
    const { cedula, nombres, apellidos, telefono, correo, contrasena } = req.body;
    try {
        await authModel.createCliente({ cedula, nombres, apellidos, telefono, correo, contrasena });
        res.redirect('/'); 
    } catch (error) {
        console.error("Error en registro:", error.message);
        res.redirect('/register'); 
    }
};

controller.login = async (req, res) => {
    const { cedula, password } = req.body;

    try {
        const user = await authModel.loginUser(cedula, password);

        if (user) {
            const rol = user.data.rol;
            const userId = user.data.id; // ID del empleado o cliente

            console.log(`Login exitoso: ${user.data.nombres} (${rol})`);

            // --- REDIRECCIÓN POR ROLES ---
            switch (rol) {
                case 'admin':
                    res.redirect(`/admin?id=${userId}`);
                    break;
                case 'gerente':
                    res.redirect(`/manager?id=${userId}`);
                    break;
                case 'cliente':
                    // Enviamos nombre también para la bienvenida
                    res.redirect(`/user?id=${userId}&name=${encodeURIComponent(user.data.nombres)}`);
                    break;
                case 'cajero':
                    // AHORA REDIRIGIMOS CON ID PARA QUE EL CAJERO CARGUE SUS DATOS
                    res.redirect(`/cashier?id=${userId}`);
                    break;
                case 'empleado':
                    res.send(`<h1>Bienvenido ${user.data.nombres}</h1><p>Panel de Estilista en construcción.</p>`);
                    break;
                default:
                    res.redirect('/');
            }
        } else {
            res.redirect('/');
        }

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).send('Error del servidor');
    }
};

controller.logout = (req, res) => {
    res.redirect('/');
};

module.exports = controller;