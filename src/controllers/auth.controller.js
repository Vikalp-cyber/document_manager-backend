"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUserRole = exports.listUsers = exports.createUser = exports.getMe = exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("../db");
const jwt_1 = require("../utils/jwt");
const fga_service_1 = require("../services/fga.service");
const register = async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
        res.status(400).json({ error: 'All fields are required' });
        return;
    }
    const validRoles = ['Admin', 'Manager', 'Developer', 'Viewer'];
    if (!validRoles.includes(role)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
    }
    try {
        const existing = await db_1.pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            res.status(409).json({ error: 'Email already exists' });
            return;
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const result = await db_1.pool.query('INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at', [name, email, passwordHash, role]);
        res.status(201).json({ user: result.rows[0] });
    }
    catch (err) {
        console.error('Error in register:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.register = register;
const login = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
    }
    try {
        const result = await db_1.pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const user = result.rows[0];
        const isMatch = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isMatch) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const token = (0, jwt_1.generateToken)({ userId: user.id, role: user.role });
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    }
    catch (err) {
        console.error('Error in login:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.login = login;
const getMe = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const result = await db_1.pool.query('SELECT id, name, email, role, created_at FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({ user: result.rows[0] });
    }
    catch (err) {
        console.error('Error in getMe:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getMe = getMe;
const createUser = async (req, res) => {
    // Only admins should hit this route. (Protected by middleware in routes, but we can verify role logic here too)
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
        res.status(400).json({ error: 'All fields are required' });
        return;
    }
    const validRoles = ['Admin', 'Manager', 'Developer', 'Viewer'];
    if (!validRoles.includes(role)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
    }
    try {
        const existing = await db_1.pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            res.status(409).json({ error: 'Email already exists' });
            return;
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const result = await db_1.pool.query('INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at', [name, email, passwordHash, role]);
        const newUser = result.rows[0];
        // If assigning an Admin, give them global FGA privileges
        if (role === 'Admin') {
            await fga_service_1.fgaService.writeTuple(`user:${newUser.id}`, 'admin', 'system:global');
        }
        res.status(201).json({ user: newUser });
    }
    catch (err) {
        console.error('Error in createUser:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.createUser = createUser;
const listUsers = async (req, res) => {
    try {
        const requesterId = req.user?.userId;
        const requesterRole = req.user?.role;
        const result = await db_1.pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
        let users = result.rows;
        // If not an admin, hide the exact roles of others to maintain privacy, 
        // as this endpoint is used by regular users purely for the sharing dropdown.
        if (requesterRole !== 'Admin') {
            users = users.map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: 'Hidden',
                created_at: u.created_at
            }));
        }
        res.json({ users });
    }
    catch (err) {
        console.error('Error in listUsers:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.listUsers = listUsers;
const updateUserRole = async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    const validRoles = ['Admin', 'Manager', 'Developer', 'Viewer'];
    if (!validRoles.includes(role)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
    }
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        const existing = await client.query('SELECT role FROM users WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const oldRole = existing.rows[0].role;
        const result = await client.query('UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role', [role, id]);
        if (oldRole !== 'Admin' && role === 'Admin') {
            await fga_service_1.fgaService.writeTuple(`user:${id}`, 'admin', 'system:global');
        }
        else if (oldRole === 'Admin' && role !== 'Admin') {
            await fga_service_1.fgaService.deleteTuple(`user:${id}`, 'admin', 'system:global');
        }
        await client.query('COMMIT');
        res.json({ user: result.rows[0] });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in updateUserRole:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
    finally {
        client.release();
    }
};
exports.updateUserRole = updateUserRole;
const deleteUser = async (req, res) => {
    const { id } = req.params;
    // Prevent default admin deletion to ensure system isn't locked out
    const defaultEmail = 'vikalp.paliwal@navigolabs.com';
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        const existing = await client.query('SELECT role, email FROM users WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (existing.rows[0].email === defaultEmail) {
            res.status(403).json({ error: 'Cannot delete the default root admin' });
            return;
        }
        const oldRole = existing.rows[0].role;
        if (oldRole === 'Admin') {
            await fga_service_1.fgaService.deleteTuple(`user:${id}`, 'admin', 'system:global');
        }
        await client.query('DELETE FROM users WHERE id = $1', [id]);
        await client.query('COMMIT');
        res.json({ message: 'User deleted successfully' });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in deleteUser:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
    finally {
        client.release();
    }
};
exports.deleteUser = deleteUser;
//# sourceMappingURL=auth.controller.js.map