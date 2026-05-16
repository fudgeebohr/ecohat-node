const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ==========================================
// 1. STUDENT REGISTER
// ==========================================
router.post('/register-user', async (req, res) => {
    try {
        const { fullName, studentNumber, programAndYear, password } = req.body;

        let user = await User.findOne({ studentNumber });
        if (user) return res.status(400).json({ message: "Student number already registered." });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = new User({
            fullName,
            studentNumber,
            programAndYear,
            password: hashedPassword,
            role: 'user'
        });

        await user.save();
        res.status(201).json({ message: "Student account created successfully." });
    } catch (err) {
        res.status(500).json({ message: "Server error during student registration." });
    }
});

// ==========================================
// 2. STUDENT LOGIN
// ==========================================
router.post('/login-user', async (req, res) => {
    try {
        const { studentNumber, password } = req.body;

        const user = await User.findOne({ studentNumber, role: 'user' });
        if (!user) return res.status(400).json({ message: "Student account not found." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid student credentials." });

        const token = jwt.sign({ id: user._id, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '2h' });

        res.json({ token, fullName: user.fullName, role: 'user' });
    } catch (err) {
        res.status(500).json({ message: "Server error during student login." });
    }
});

// ==========================================
// ADMIN REGISTER (Separate Storage)
// ==========================================
router.post('/register-admin', async (req, res) => {
    try {
        const { username, password, adminKey } = req.body;

        if (adminKey !== process.env.ADMIN_REGISTRATION_KEY) {
            return res.status(401).json({ message: "Invalid Admin Key" });
        }

        // Check the ADMIN collection specifically
        let admin = await Admin.findOne({ username });
        if (admin) return res.status(400).json({ message: "Admin username taken" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newAdmin = new Admin({
            username,
            password: hashedPassword
        });

        await newAdmin.save();
        res.status(201).json({ message: "Admin created in separate storage!" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// ==========================================
// ADMIN LOGIN
// ==========================================
router.post('/login-admin', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Query the Admin collection
        const admin = await Admin.findOne({ username });
        if (!admin) return res.status(400).json({ message: "Admin account not found" });

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

        const token = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '2h' });

        res.json({ token, fullName: admin.username, role: 'admin' });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// Get Top 10 users for the leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const users = await User.find({ 
        role: 'user',
        privacyMode: { $ne: true } // Only fetch users where privacyMode is NOT true
      }) 
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

// Get current user profile (for balance and activity)
router.get('/profile', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const User = require('../models/User');

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT route to update the user profile
router.put('/profile', async (req, res) => { 
  try {
    const jwt = require('jsonwebtoken');
    const User = require('../models/User');
    
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user = await User.findById(decoded.id); 
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { fullName, programAndYear, studentNumber, privacyMode } = req.body;

    if (fullName) user.fullName = fullName;
    if (programAndYear) user.programAndYear = programAndYear;
    if (studentNumber) user.studentNumber = studentNumber;
    
    // Explicitly check for boolean values to avoid falsy skip bugs
    if (privacyMode !== undefined) {
      user.privacyMode = privacyMode;
    }

    await user.save();
    res.json(user);

  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).send('Server Error');
  }
});

module.exports = router;