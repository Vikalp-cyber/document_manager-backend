import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const seed = async () => {
    const passwordHash = await bcrypt.hash('password123', 10);

    const users = [
        { name: 'Alice Admin', email: 'admin@docmgr.com', role: 'Admin' },
        { name: 'Bob Manager', email: 'manager@docmgr.com', role: 'Manager' },
        { name: 'Charlie Dev', email: 'dev@docmgr.com', role: 'Developer' },
        { name: 'Dave Viewer', email: 'viewer@docmgr.com', role: 'Viewer' }
    ];

    for (const u of users) {
        try {
            await pool.query(
                'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING',
                [u.name, u.email, passwordHash, u.role]
            );
            console.log(`Seeded ${u.role}: ${u.email} / password123`);
        } catch (e) {
            console.error(e);
        }
    }

    process.exit(0);
};

seed();
