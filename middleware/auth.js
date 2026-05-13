const jwt = require('jsonwebtoken');
const Student = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return next(); // Allow public access to leaderboard

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id); 
    
    if (user) {
      req.user = {
        studentNumber: user.studentNumber,
        fullName: user.fullName,
        points: user.points
      };
    }
    next();
  } catch (error) {
    console.error('Auth error:', error);
    next();
  }
};

module.exports = auth;