const express = require('express');
const router = express.Router();
const User = require('../models/user'); // Your exact model

// GET /api/profile
router.get('/profile', async (req, res) => {
  try {
    const studentNumber = req.user?.studentNumber || req.query.studentNumber;
    if (!studentNumber) {
      return res.status(401).json({ error: 'No student number provided' });
    }

    const user = await User.findOne({ studentNumber });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      studentNumber: user.studentNumber,
      fullName: user.fullName,
      programAndYear: user.programAndYear,
      points: user.points || 0,
      role: user.role,
      recentActivity: user.recentActivity || []
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leaderboard - Top 10 users by points
router.get('/leaderboard', async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }) // Only students, not admins
      .sort({ points: -1 })
      .limit(10)
      .select('studentNumber fullName programAndYear points');

    res.json(users.map((user, index) => ({
      position: index + 1,
      studentNumber: user.studentNumber,
      fullName: user.fullName,
      programAndYear: user.programAndYear,
      points: user.points || 0
    })));
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/user-history/:studentNumber
router.get('/user-history/:studentNumber', async (req, res) => {
  try {
    const user = await User.findOne({ studentNumber: req.params.studentNumber });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      points: user.points || 0,
      recentActivity: user.recentActivity || []
    });
  } catch (error) {
    console.error('User history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;