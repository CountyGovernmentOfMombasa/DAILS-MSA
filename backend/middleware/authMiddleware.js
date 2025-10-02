const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const parseMinutes = (v, d) => { const n = parseInt(v,10); return isNaN(n)?d:n; };
const INACTIVITY_MINUTES = parseMinutes(process.env.INACTIVITY_TIMEOUT_MINUTES || '30', 30);
const INACTIVITY_MS = INACTIVITY_MINUTES * 60000;

exports.verifyToken = async (req, res, next) => {
    // Get token from header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;

    if (!token) {
        return res.status(403).json({ 
            message: 'A token is required for authentication' 
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // base payload (likely { id })
        // Inactivity check (soft). We query lightweight last_activity & update.
        if (decoded && decoded.id) {
            try {
                const [rows] = await pool.query('SELECT last_activity FROM users WHERE id = ?', [decoded.id]);
                if (rows.length) {
                    const la = rows[0].last_activity;
                    if (la && INACTIVITY_MS > 0) {
                        const diff = Date.now() - new Date(la).getTime();
                        if (diff > INACTIVITY_MS) {
                            return res.status(401).json({ message: 'Session expired due to inactivity' });
                        }
                    }
                    // Update last_activity asynchronously (do not block response)
                    pool.query('UPDATE users SET last_activity = NOW() WHERE id = ?', [decoded.id]).catch(()=>{});
                }
            } catch(e) {
                console.warn('Inactivity check failed:', e.message);
            }
        }
        // Hydrate with full user record (non-blocking critical path, but awaited here for simplicity)
        try {
            const getCurrentUser = require('../util/currentUser');
            const fullUser = await getCurrentUser(decoded.id);
            if (fullUser) {
                // Merge but do not overwrite token claims
                req.user = { ...fullUser, token_claims: decoded };
            }
        } catch (hydrateErr) {
            console.warn('User hydration failed:', hydrateErr.message);
        }
        next();
    } catch (error) {
        return res.status(401).json({ 
            message: 'Invalid token' 
        });
    }
};