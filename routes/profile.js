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

// PUT route to update the user profile
router.put('/profile', async (req, res) => { 
  try {
    // ---------------- DEBUGGING LOGS ----------------
    console.log("--- EDIT PROFILE ROUTE HIT ---");
    console.log("1. Data inside token (req.user):", req.user);
    console.log("2. Data from frontend (req.body):", req.body);
    // ------------------------------------------------

    const { fullName, programAndYear, studentNumber } = req.body;
    let user = null;

    // STRATEGY 1: Try to find by Mongo ID (checking id, _id, or userId)
    const tokenId = req.user?.id || req.user?._id || req.user?.userId;
    if (tokenId) {
      user = await Student.findById(tokenId);
      console.log("3a. Searched by ID. Found user in DB:", user ? "Yes" : "No");
    }

    // STRATEGY 2: Fallback - Try to find by the original student number in the token
    if (!user && req.user?.studentNumber) {
      user = await Student.findOne({ studentNumber: req.user.studentNumber });
      console.log("3b. Searched by Student Number. Found user in DB:", user ? "Yes" : "No");
    }

    // IF STILL NOT FOUND: Throw the 404
    if (!user) {
      console.log("4. ERROR: Could not locate user in DB based on token.");
      return res.status(404).json({ error: 'User not found in database.' });
    }

    // APPLY UPDATES
    if (fullName) user.fullName = fullName;
    if (programAndYear) user.programAndYear = programAndYear;
    if (studentNumber) user.studentNumber = studentNumber;

    // SAVE AND RESPOND
    await user.save();
    console.log("5. SUCCESS: Profile updated for:", user.fullName);
    res.json(user);

  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).send('Server Error');
  }
});

module.exports = router;