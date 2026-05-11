const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// REGISTER ROUTE (Handles both Students and Admins)
router.post('/register', async (req, res) => {
    try {
        const { fullName, studentNumber, programAndYear, password, role, adminKey } = req.body;

        // 1. SECURITY GATE: If registering as admin, verify the secret key
        if (role === 'admin') {
            const SECRET_KEY = process.env.ADMIN_REGISTRATION_KEY;
            if (!adminKey || adminKey !== SECRET_KEY) {
                return res.status(401).json({ message: "Unauthorized: Invalid Admin Registration Key." });
            }
        }

        // 2. Check if user already exists (using studentNumber as the unique ID)
        let user = await User.findOne({ studentNumber });
        if (user) {
            return res.status(400).json({ 
                message: role === 'admin' ? "Admin ID already registered" : "Student already registered" 
            });
        }

        // 3. Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 4. Create new user with Role
        user = new User({
            fullName,
            studentNumber,
            programAndYear: programAndYear || "N/A", // Admins might not have a section
            password: hashedPassword,
            role: role || 'user' // Defaults to 'user' if not specified
        });

        await user.save();
        res.status(201).json({ message: `${role === 'admin' ? 'Admin' : 'Student'} registered successfully` });

    } catch (err) {
        console.error("Registration Error:", err);
        res.status(500).json({ message: "Server error during registration" });
    }
});

// LOGIN ROUTE
router.post('/login', async (req, res) => {
    try {
        const { studentNumber, password, role } = req.body;

        // 1. Check if user exists
        const user = await User.findOne({ studentNumber });
        if (!user) return res.status(400).json({ message: "Invalid Credentials" });

        // 2. Verify Role (Ensures Students can't log into the Admin portal)
        if (role && user.role !== role) {
            return res.status(403).json({ message: `Access denied. Account is not registered as ${role}.` });
        }

        // 3. Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid Credentials" });

        // 4. Create JWT Token (Include role in the payload)
        const token = jwt.sign(
            { id: user._id, role: user.role }, 
            process.env.JWT_SECRET, 
            { expiresIn: '2h' }
        );

        res.json({
            token,
            fullName: user.fullName,
            role: user.role,
            message: "Login successful"
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ message: "Server error during login" });
    }
});

module.exports = router;