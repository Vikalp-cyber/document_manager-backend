"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
});
const migrate = async () => {
    try {
        console.log('Starting migration: Adding zoho_id to users table...');
        // Add zoho_id column if it doesn't exist
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS zoho_id VARCHAR(255) UNIQUE;
        `);
        // Make password_hash nullable
        await pool.query(`
            ALTER TABLE users 
            ALTER COLUMN password_hash DROP NOT NULL;
        `);
        console.log('Migration successful: users table updated.');
    }
    catch (err) {
        console.error('Migration failed:', err);
    }
    finally {
        await pool.end();
        process.exit(0);
    }
};
migrate();
//# sourceMappingURL=migrate_zoho.js.map