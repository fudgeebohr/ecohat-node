const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

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

        if (user.isArchived) {
          user.isArchived = false; // Un-archive/Reactivate dynamically
          await user.save();
          console.log(`Account reactivated automatically for: ${user.fullName}`);
        }

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

// GET /api/leaderboard - Top 10 users sorted by total points (excluding private profiles)
router.get('/leaderboard', async (req, res) => {
  try {
    const User = require('../models/User'); // Explicitly imported cleanly here

    // 1. Fetch top 10 users who are students and have NOT turned on privacy mode
    const users = await User.find({ 
        role: 'user',
        privacyMode: { $ne: true },
        isArchived: { $ne: true }
      }) 
      .sort({ points: -1 }) // Sorts by active points highest to lowest
      .limit(10)
      .select('studentNumber fullName programAndYear totalPointsEarned');

    // 2. Map the data structure cleanly for your frontend table rows
    const formattedLeaderboard = users.map((user, index) => ({
      position: index + 1,
      studentNumber: user.studentNumber,
      fullName: user.fullName,
      programAndYear: user.programAndYear,
      totalPointsEarned: user.totalPointsEarned || 0
    }));

    res.json(formattedLeaderboard);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Server error fetching leaderboard' });
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

// POST /api/auth/deactivate - Archive user account
router.post('/deactivate', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const User = require('../models/User');
    
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Mark the account as archived/deactivated
    user.isArchived = true;
    await user.save();

    res.json({ message: 'Account archived successfully' });
  } catch (error) {
    console.error("Deactivation error:", error);
    res.status(500).json({ message: 'Server error during deactivation' });
  }
});

router.post('/cart/sync', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Replace the user's cart in MongoDB with the fresh array from the frontend
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: 'User missing' });

    user.cart = req.body.cart; // Sync array payload
    await user.save();

    res.json({ success: true, message: 'Cart synced across cloud cloud nodes successfully.' });
  } catch (error) {
    console.error('Cloud synchronization failure:', error);
    res.status(500).json({ message: 'Server error during sync operations.' });
  }
});

router.post('/rewards/checkout-cart', async (req, res) => {
  try {
    const { items, totalCost } = req.body;
    
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: "User profile missing." });

    // Still validate balance thresholds on generation to prevent spamming
    if (user.points < totalCost) {
      return res.status(400).json({ message: "Insufficient points balance." });
    }

    // 1. Generate the unique voucher code reference string
    const uniqueBatchToken = `ECO-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const cartSummaryText = items.map(i => `${i.quantity}x ${i.name}`).join(', ');

    // 2. Clear out their active cloud bag array profile since it's now wrapped inside a token
    user.cart = [];
    await user.save();

    // 3. Return the payload. The user's points stay untouched for now!
    res.json({
      success: true,
      qrTokenString: uniqueBatchToken,
      totalCost: totalCost,
      summary: cartSummaryText
    });

  } catch (error) {
    console.error("Checkout validation error:", error);
    res.status(500).json({ message: "Internal server error during token generation." });
  }
});

router.post('/admin/verify-redemption', async (req, res) => {
  try {
    const { qrTokenString, studentNumber, totalCost, summary } = req.body;

    // 1. Double check the user exists
    const user = await User.findOne({ studentNumber });
    if (!user) return res.status(404).json({ message: "Student account not found." });

    // 2. Validate live balance bounds before executing deductions
    if (user.points < totalCost) {
      return res.status(400).json({ message: "Deduction failed: Student has insufficient points live." });
    }

    // 3. SECURE ATOMICITY: Execute your precise MongoDB query structure completely in one go
    await User.updateOne(
      { studentNumber: studentNumber },
      {
        $inc: { points: -Number(totalCost) }, 
        $push: {
          history: {
            type: "redeem",
            points: -Number(totalCost),
            date: new Date(),
            description: `${summary} Redeemed`,
            qrReferenceCode: qrTokenString // Track token matching validation identifiers
          }
        }
      }
    );

    res.json({ 
      success: true, 
      message: `Successfully processed redemption for ${user.fullName}! Points deducted: -${totalCost}` 
    });

  } catch (error) {
    console.error("Admin scanning processing execution failure:", error);
    res.status(500).json({ message: "Server error during scanner confirmation verification processing loops." });
  }
});

module.exports = router;