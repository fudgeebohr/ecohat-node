const express = require('express');
const router = express.Router();
const User = require('../models/User');
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
// ADMIN REGISTER (Restricted Inputs)
// ==========================================
router.post('/register-admin', async (req, res) => {
    try {
        // Only accept these three specific inputs
        const { username, password, adminKey } = req.body;

        // 1. Verify Secret Key from .env
        if (adminKey !== process.env.ADMIN_REGISTRATION_KEY) {
            return res.status(401).json({ message: "Unauthorized: Invalid Admin Key." });
        }

        // 2. Check if admin username already exists
        let user = await User.findOne({ studentNumber: username });
        if (user) return res.status(400).json({ message: "Username already taken." });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Create Admin (Mapping 'username' to 'studentNumber')
        const newAdmin = new User({
            fullName: username, // Using username as name for simplicity
            studentNumber: username, 
            programAndYear: "ADMIN_LEVEL",
            password: hashedPassword,
            role: 'admin'
        });

        await newAdmin.save();
        res.status(201).json({ message: "Administrator registered successfully." });
    } catch (err) {
        res.status(500).json({ message: "Server error during admin registration." });
    }
});

// ==========================================
// ADMIN LOGIN (Restricted Inputs)
// ==========================================
router.post('/login-admin', async (req, res) => {
    try {
        // Only accept username and password
        const { username, password } = req.body;

        const user = await User.findOne({ studentNumber: username, role: 'admin' });
        if (!user) return res.status(400).json({ message: "Administrator account not found." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid admin credentials." });

        const token = jwt.sign({ id: user._id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '2h' });

        res.json({ 
            token, 
            fullName: user.fullName, 
            role: 'admin',
            message: "Login Successful"
        });
    } catch (err) {
        res.status(500).json({ message: "Server error during admin login." });
    }
});

module.exports = router;