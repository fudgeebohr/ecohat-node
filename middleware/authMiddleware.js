const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    // 1. Extract the token from the Authorization header (Format: "Bearer <token>")
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    // 2. Verify the token using your JWT_SECRET environment variable
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Attach the decoded user data payload (e.g., user id and role) to the req object
    req.user = decoded;

    // 4. Pass control to the next handler function in your route line
    next();
  } catch (error) {
    console.error("Middleware token verification failed:", error.message);
    return res.status(401).json({ message: 'Invalid or expired authorization token.' });
  }
};

module.exports = authMiddleware;