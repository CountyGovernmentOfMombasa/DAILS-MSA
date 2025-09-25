const jwt = require('jsonwebtoken');

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