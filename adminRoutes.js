const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const { validateAdmin } = require('./adminAuth');
dotenv.config();

const SECRET_KEY = process.env.SECRET_KEY || 'your_secret_key_here';

function adminRouter() {
    const router = express.Router();
    router.use(cookieParser(SECRET_KEY));
    router.use(express.json());
    router.use(express.urlencoded({ extended: true }));

    // Login route
    router.post('/login', (req, res) => {
        const { username, password } = req.body;
        if (validateAdmin(username, password)) {
            res.cookie('admin_logged_in', 'yes', {
                httpOnly: true,
                signed: true,
                sameSite: 'strict',
                maxAge: 2 * 60 * 60 * 1000
            });
            return res.json({ success: true });
        }
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
    });

    // Logout route
    router.post('/logout', (req, res) => {
        res.clearCookie('admin_logged_in');
        res.json({ success: true });
    });

    // Middleware to protect routes
    function requireAuth(req, res, next) {
        if (req.signedCookies && req.signedCookies.admin_logged_in === 'yes') {
            return next();
        }
        return res.redirect('/index.html');
    }

    // Protect dashboard.html
    router.get('/dashboard.html', requireAuth, (req, res) => {
        res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
    });

    // Serve dashboard.json
    router.get('/dashboard-data', requireAuth, (req, res) => {
        fs.readFile(path.join(__dirname, 'dashboard.json'), 'utf8', (err, data) => {
            if (err) return res.status(500).json({ error: 'Cannot load dashboard data' });
            res.json(JSON.parse(data));
        });
    });

    // Serve static files
    router.use(express.static(path.join(__dirname, 'admin')));

    // 404 fallback
    router.use((req, res) => {
        res.status(404).sendFile(path.join(__dirname, 'admin', '404.html'));
    });

    return router;
}

module.exports = adminRouter;