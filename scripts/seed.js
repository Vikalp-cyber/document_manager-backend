"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
});
const seed = async () => {
    const passwordHash = await bcryptjs_1.default.hash('password123', 10);
    const users = [
        { name: 'Alice Admin', email: 'admin@docmgr.com', role: 'Admin' },
        { name: 'Bob Manager', email: 'manager@docmgr.com', role: 'Manager' },
        { name: 'Charlie Dev', email: 'dev@docmgr.com', role: 'Developer' },
        { name: 'Dave Viewer', email: 'viewer@docmgr.com', role: 'Viewer' }
    ];
    for (const u of users) {
        try {
            await pool.query('INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING', [u.name, u.email, passwordHash, u.role]);
            console.log(`Seeded ${u.role}: ${u.email} / password123`);
        }
        catch (e) {
            console.error(e);
        }
    }
    process.exit(0);
};
seed();
//# sourceMappingURL=seed.js.map