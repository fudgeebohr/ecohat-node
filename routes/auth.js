const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs'); // For password hashing
const jwt = require('jsonwebtoken'); // For session tokens

// REGISTER ROUTE
router.post('/register', async (req, res) => {
    try {
        const { fullName, studentNumber, programAndYear, password } = req.body;

        // 1. Check if user already exists
        let user = await User.findOne({ studentNumber });
        if (user) return res.status(400).json({ message: "Student already registered" });

        // 2. Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Create new user
        user = new User({
            fullName,
            studentNumber,
            programAndYear,
            password: hashedPassword
        });

        await user.save();
        res.status(201).json({ message: "Student registered successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error during registration" });
    }
});

// LOGIN ROUTE
router.post('/login', async (req, res) => {
    try {
        const { studentNumber, password } = req.body;

        // 1. Check if student exists
        const user = await User.findOne({ studentNumber });
        if (!user) return res.status(400).json({ message: "Invalid Student Number" });

        // 2. Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid Password" });

        // 3. Create JWT Token
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.json({
            token,
            fullName: user.fullName,
            message: "Login successful"
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error during login" });
    }
});

module.exports = router;