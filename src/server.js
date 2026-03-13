"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const project_routes_1 = __importDefault(require("./routes/project.routes"));
const document_routes_1 = __importDefault(require("./routes/document.routes"));
const folder_routes_1 = __importDefault(require("./routes/folder.routes"));
const fga_service_1 = require("./services/fga.service");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("./db");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/api/auth', auth_routes_1.default);
app.use('/api/projects', project_routes_1.default);
app.use('/api', document_routes_1.default);
app.use('/api', folder_routes_1.default);
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
const ensureDefaultAdmin = async () => {
    const email = 'vikalp.paliwal@navigolabs.com';
    const password = 'Vikalp@321';
    try {
        const result = await db_1.pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            const passwordHash = await bcryptjs_1.default.hash(password, 10);
            const result = await db_1.pool.query('INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id', ['Vikalp Admin', email, passwordHash, 'Admin']);
            const adminId = result.rows[0].id;
            await fga_service_1.fgaService.writeTuple(`user:${adminId}`, 'admin', 'system:global');
            console.log('Default admin vikalp.paliwal@navigolabs.com created with global admin permissions.');
        }
        else {
            const adminId = result.rows[0].id;
            await fga_service_1.fgaService.writeTuple(`user:${adminId}`, 'admin', 'system:global');
            console.log('Default admin already exists. Ensured FGA global admin correlation.');
        }
    }
    catch (err) {
        console.error('Error ensuring default admin:', err);
    }
};
const startServer = async () => {
    try {
        await fga_service_1.fgaService.initialize();
        console.log('OpenFGA initialized successfully.');
        await ensureDefaultAdmin();
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    }
    catch (err) {
        console.error('Final startup error:', err);
        process.exit(1);
    }
};
startServer();
//# sourceMappingURL=server.js.map