const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Item = require('../models/Item');

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

    // ─── DECREMENT GLOBAL KIOSK INVENTORY STOCK LEVELS ────────────────
    if (summary && summary.trim() !== "") {
      const itemSegments = summary.split(', ');

      const stockUpdatePromises = itemSegments.map(async (segment) => {
        const parts = segment.trim().split(' ');
        if (parts.length >= 2) {
          const qtyPart = parts[0]; 
          const quantityClaimed = parseInt(qtyPart.replace('x', ''), 10);
          const itemName = parts.slice(1).join(' '); 

          if (!isNaN(quantityClaimed) && quantityClaimed > 0) {
            await Item.findOneAndUpdate(
              { name: itemName },
              { $inc: { stock: -quantityClaimed } }
            );
          }
        }
      });
      await Promise.all(stockUpdatePromises);
    }

    // 3. SECURE ATOMICITY: Deduct user points and push history block simultaneously 
    await User.updateOne(
      { studentNumber: studentNumber },
      {
        // ◄ FIX: This instantly drops their running account balance in the database cluster!
        $inc: { points: -Number(totalCost) }, 
        $push: {
          history: {
            type: "redeem",
            points: -Number(totalCost), 
            date: new Date(),
            description: `${summary} Redeemed`,
            qrReferenceCode: qrTokenString 
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

// ─── GET ADMIN DASHBOARD STATS OVERVIEW ──────────────────────────────────
router.get('/admin/bottle-stats', async (req, res) => {
  try {
    const now = new Date();

    // 1. Define Temporal Boundaries (Using UTC/Local Midnights)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const startOfWeek = new Date(now);
    const dayOfWeek = now.getDay(); // 0 (Sun) - 6 (Sat)
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0,0,0,0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Helper helper function to run the MongoDB unwind + aggregation pipeline
    const getIntakeSum = async (startDate) => {
      const result = await User.aggregate([
        { $unwind: "$history" }, // Flatten the history array elements out into separate documents
        { 
          $match: { 
            "history.type": "deposit",
            "history.date": { $gte: startDate }
          } 
        },
        {
          // We need to parse out the number of bottles from the description string
          // e.g., "24 Bottles Deposited" -> extract 24
          $project: {
            bottlesCount: {
              $convert: {
                input: { $arrayElemAt: [{ $split: ["$history.description", " "] }, 0] },
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        },
        { 
          $group: { 
            _id: null, 
            total: { $sum: "$bottlesCount" } 
          } 
        }
      ]);
      return result.length > 0 ? result[0].total : 0;
    };

    // 2. Execute aggregations in parallel paths
    const [todayCount, weeklyCount, monthlyCount] = await Promise.all([
      getIntakeSum(startOfToday),
      getIntakeSum(startOfWeek),
      getIntakeSum(startOfMonth)
    ]);

    res.json({
      success: true,
      today: todayCount,
      weekly: weeklyCount,
      monthly: monthlyCount
    });

  } catch (error) {
    console.error("Aggregation stats breakdown crash:", error);
    res.status(500).json({ message: "Failed to compile intake dashboard metrics." });
  }
});

// GET ALL INVENTORY STOCK ITEMS
router.get('/admin/inventory', async (req, res) => {
  try {
    // If the database is completely empty (first run), seed your default list automatically
    let items = await Item.find().sort({ id: 1 });
    
    if (items.length === 0) {
      const defaultItems = [
        { id: 1, name: 'Notebook', price: 50, stock: 95 },
        { id: 2, name: 'Ballpen', price: 20, stock: 98 },
        { id: 3, name: 'Pencil', price: 15, stock: 89 },
        { id: 4, name: 'Yellow Paper', price: 40, stock: 50 },
        { id: 5, name: 'Scissors', price: 60, stock: 30 },
        { id: 6, name: 'Crayons', price: 80, stock: 25 },
        { id: 7, name: 'Ruler', price: 25, stock: 40 },
        { id: 8, name: 'Eraser', price: 10, stock: 120 },
        { id: 9, name: 'Folder', price: 15, stock: 200 },
        { id: 10, name: 'Correction Tape', price: 45, stock: 15 }
      ];
      items = await Item.insertMany(defaultItems);
    }
    
    res.json({ success: true, inventory: items });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch inventory storage maps." });
  }
});

// POST UPDATE SPECIFIC ITEM STOCK LIMIT
router.post('/admin/inventory/update', async (req, res) => {
  const { id, newStock } = req.body;
  try {
    const updatedItem = await Item.findOneAndUpdate(
      { id: Number(id) },
      { $set: { stock: Number(newStock) } },
      { new: true }
    );
    if (!updatedItem) return res.status(404).json({ message: "Item not found." });
    
    res.json({ success: true, message: `${updatedItem.name} stock updated to ${newStock}!`, item: updatedItem });
  } catch (error) {
    res.status(500).json({ message: "Failed to execute stock update parameters." });
  }
});

// GET LIVE INVENTORY FOR STUDENTS (Read-Only)
router.get('/rewards/inventory', async (req, res) => {
  try {
    const items = await Item.find().sort({ id: 1 });
    res.json({ success: true, inventory: items });
  } catch (error) {
    res.status(500).json({ message: "Failed to load rewards inventory options." });
  }
});

module.exports = router;