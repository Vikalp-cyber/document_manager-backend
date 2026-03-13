import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
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
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
        process.exit(0);
    }
};

migrate();
