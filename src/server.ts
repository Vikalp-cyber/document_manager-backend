import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import projectRoutes from './routes/project.routes';
import documentRoutes from './routes/document.routes';
import folderRoutes from './routes/folder.routes';
import { fgaService } from './services/fga.service';
import bcrypt from 'bcryptjs';
import { pool } from './db';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', documentRoutes);
app.use('/api', folderRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const ensureDefaultAdmin = async () => {
    const email = 'vikalp.paliwal@navigolabs.com';
    const password = 'Vikalp@321';

    try {
        const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            const passwordHash = await bcrypt.hash(password, 10);
            const result = await pool.query(
                'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
                ['Vikalp Admin', email, passwordHash, 'Admin']
            );

            const adminId = result.rows[0].id;

            await fgaService.writeTuple(
                `user:${adminId}`,
                'admin',
                'system:global'
            );

            console.log('Default admin vikalp.paliwal@navigolabs.com created with global admin permissions.');
        } else {
            const adminId = result.rows[0].id;
            await fgaService.writeTuple(
                `user:${adminId}`,
                'admin',
                'system:global'
            );
            console.log('Default admin already exists. Ensured FGA global admin correlation.');
        }
    } catch (err) {
        console.error('Error ensuring default admin:', err);
    }
};

const startServer = async () => {
    try {
        await fgaService.initialize();
        console.log('OpenFGA initialized successfully.');

        await ensureDefaultAdmin();

        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (err) {
        console.error('Final startup error:', err);
        process.exit(1);
    }
};

startServer();
