const Voucher = require('../models/Voucher');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Item = require('../models/Item');
const KioskSession = require('../models/KioskSession');
const authMiddleware = require('../middleware/authMiddleware');

// ─── CENTRALIZED BACKEND RANK HELPER FUNCTION ────────────────────────────
const getRankDetails = (totalPointsEarned) => {
  const points = totalPointsEarned || 0;
  if (points <= 150) {
    return { rankTitle: "Green Guardian", rankClass: "rank-green" };
  } else if (points >= 151 && points <= 250) {
    return { rankTitle: "Eco Crusader", rankClass: "rank-earth-blue" };
  } else if (points >= 251 && points <= 350) {
    return { rankTitle: "Planet Protector", rankClass: "rank-gold" };
  } else {
    return { rankTitle: "Nature Knight", rankClass: "rank-magenta" };
  }
};

// ─── IN-MEMORY BADGE MILESTONE BONUS INTERCEPTOR ─────────────────────────
const checkAndAwardBadgeBonus = (user, pointsToAdd) => {
  const currentTotal = user.totalPointsEarned || 0;
  const newTotal = currentTotal + pointsToAdd;

  const milestones = [
    { name: "Eco Crusader",   threshold: 151, bonus: 15 },
    { name: "Planet Protector", threshold: 251, bonus: 20 },
    { name: "Nature Knight",    threshold: 351, bonus: 25 }
  ];

  for (const milestone of milestones) {
    // Triggers perfectly even if they jump straight past 151 to 160 points
    if (newTotal >= milestone.threshold && currentTotal < milestone.threshold) {
      
      // Mutate user object attributes directly to avoid asynchronous save conflicts
      user.points += milestone.bonus;
      user.totalPointsEarned += milestone.bonus;
      
      user.recentActivity.push({
        type: "Badge Reward",
        points: milestone.bonus,
        date: new Date(),
        description: `Earned '${milestone.name}' Badge`
      });
      
      console.log(`🎉 In-Memory Badge Milestone Set: +${milestone.bonus} for ${user.fullName}`);
      break; 
    }
  }
};

// ==========================================
// 1. STUDENT REGISTER
// ==========================================
router.post('/register-user', async (req, res) => {
  try {
    const { fullName, studentNumber, programAndYear, password } = req.body;
    const studentNumberRegex = /^\d{4}-\d{5}-BN-\d{1}$/;
    
    if (!studentNumberRegex.test(studentNumber)) {
      return res.status(400).json({ 
        message: "Registration rejected: Student number format must strictly match XXXX-XXXXX-BN-X (e.g., 2022-00211-BN-0)." 
      });
    }

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
      user.isArchived = false; 
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

// GET /api/leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const users = await User.find({ 
      role: 'user',
      privacyMode: { $ne: true },
      isArchived: { $ne: true }
    }) 
    .sort({ points: -1 }) 
    .limit(10)
    .select('studentNumber fullName programAndYear totalPointsEarned');

    const formattedLeaderboard = users.map((user, index) => {
      const rank = getRankDetails(user.totalPointsEarned);
      return {
        position: index + 1,
        studentNumber: user.studentNumber,
        fullName: user.fullName,
        programAndYear: user.programAndYear,
        totalPointsEarned: user.totalPointsEarned || 0,
        ...rank 
      };
    });

    res.json(formattedLeaderboard);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Server error fetching leaderboard' });
  }
});

// Get current user profile 
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const rank = getRankDetails(user.totalPointsEarned);
    
    res.json({
      ...user.toObject(),
      ...rank
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT route to update the user profile
router.put('/profile', async (req, res) => { 
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user = await User.findById(decoded.id); 
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { fullName, programAndYear, studentNumber, privacyMode, recentActivity, points, totalPointsEarned } = req.body;

    // ─── HARDWARE DEPOSIT INTERCEPTOR MACHINE ────────────────────────────
    // If incoming payload logs a total points change, pass it straight to the direct evaluator
    if (totalPointsEarned && Number(totalPointsEarned) > user.totalPointsEarned) {
      const addedHardwarePoints = Number(totalPointsEarned) - user.totalPointsEarned;
      
      // Execute local mutation. Both badge points and reward strings get pushed safely
      checkAndAwardBadgeBonus(user, addedHardwarePoints);
    }
    // ─────────────────────────────────────────────────────────────────────

    // Map regular incoming modifications
    if (fullName) user.fullName = fullName;
    if (programAndYear) user.programAndYear = programAndYear;
    if (studentNumber) user.studentNumber = studentNumber;
    if (privacyMode !== undefined) user.privacyMode = privacyMode;
    
    if (recentActivity) {
      user.recentActivity.push(recentActivity);
    }
    
    if (points !== undefined) user.points = points;
    if (totalPointsEarned !== undefined) user.totalPointsEarned = totalPointsEarned;

    // This save step now writes both the machine's deposit metrics AND your bonus atomically!
    await user.save();
    
    const rank = getRankDetails(user.totalPointsEarned);
    res.json({
      ...user.toObject(),
      ...rank
    });

  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).send('Server Error');
  }
});

// POST /api/auth/deactivate
router.post('/deactivate', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isArchived = true;
    await user.save();

    res.json({ message: 'Account archived successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during deactivation' });
  }
});

router.post('/cart/sync', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: 'User missing' });

    user.cart = req.body.cart; 
    await user.save();

    res.json({ success: true, message: 'Cart synced across cloud nodes successfully.' });
  } catch (error) {
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
    if (user.points < totalCost) return res.status(400).json({ message: "Insufficient points balance." });

    const uniqueBatchToken = `ECO-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const cartSummaryText = items && items.length > 0 
      ? items.map(i => `${i.quantity}x ${i.name}`).join(', ')
      : 'School Supplies Package';

    try {
      const VoucherModel = require('../models/Voucher');
      const newVoucher = new VoucherModel({
        token: uniqueBatchToken,
        studentNumber: user.studentNumber,
        itemsSummary: cartSummaryText,
        totalCost: Number(totalCost)
      });
      await newVoucher.save();
    } catch (dbError) {
      console.error("❌ [DATABASE CRASH LOG]: Voucher indexing failed:", dbError.message);
      return res.status(500).json({ 
        success: false, 
        message: "Kiosk tracking database error. Voucher token generation aborted." 
      });
    }

    user.cart = [];
    await user.save();

    res.json({
      success: true,
      qrTokenString: uniqueBatchToken,
      totalCost: totalCost,
      summary: cartSummaryText
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error during token generation." });
  }
});

router.post('/admin/verify-redemption', async (req, res) => {
  try {
    const { qrTokenString, studentNumber, totalCost, summary } = req.body;

    const user = await User.findOne({ studentNumber });
    if (!user) return res.status(404).json({ message: "Student account not found." });
    if (user.points < totalCost) {
      return res.status(400).json({ message: "Deduction failed: Student has insufficient points live." });
    }

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

    try {
      const VoucherModel = require('../models/Voucher');
      await VoucherModel.findOneAndUpdate({ token: qrTokenString }, { isRedeemed: true });
    } catch (err) {
      console.error("Non-blocking voucher flag adjustment error:", err);
    }

    await User.updateOne(
      { studentNumber: studentNumber },
      {
        $inc: { points: -Number(totalCost) }, 
        $push: {
          recentActivity: {
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
    res.status(500).json({ message: "Server error during scanner confirmation verification processing loops." });
  }
});

// ─── GET ADMIN DASHBOARD STATS OVERVIEW ──────────────────────────────────
router.get('/admin/bottle-stats', async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const startOfWeek = new Date(now);
    const dayOfWeek = now.getDay(); 
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0,0,0,0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const getIntakeSum = async (startDate) => {
      const result = await User.aggregate([
        { $unwind: "$recentActivity" }, 
        { 
          $match: { 
            $or: [
              { "recentActivity.type": "deposit" },
              { "recentActivity.type": "bottle" },
              { "recentActivity.type": { $regex: /deposit|bottle/i } } 
            ]
          } 
        },
        {
          $project: {
            recentActivity: 1,
            activityDate: {
              $convert: {
                input: "$recentActivity.date",
                to: "date",
                onError: new Date(0), 
                onNull: new Date(0)
              }
            }
          }
        },
        {
          $match: {
            "activityDate": { $gte: startDate }
          }
        },
        {
          $project: {
            bottlesCount: {
              $cond: {
                if: {
                  $eq: [
                    {
                      $convert: {
                        input: { $arrayElemAt: [{ $split: ["$recentActivity.description", " "] }, 0] },
                        to: "int",
                        onError: 0,
                        onNull: 0
                      }
                    },
                    0
                  ]
                },
                then: { $abs: { $trunc: { $divide: ["$recentActivity.points", 2] } } },
                else: {
                  $convert: {
                    input: { $arrayElemAt: [{ $split: ["$recentActivity.description", " "] }, 0] },
                    to: "int",
                    onError: 0,
                    onNull: 0
                  }
                }
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
    let items = await Item.find().sort({ id: 1 });
    
    if (items.length === 0) {
      const defaultItems = [
        { id: 1, name: 'Ruler', price: 20, stock: 40 },
        { id: 2, name: 'Bond Papers (2 pcs)', price: 10, stock: 150 },
        { id: 3, name: 'Yellow Paper (Whole Pad)', price: 60, stock: 50 },
        { id: 4, name: 'Yellow Paper (Half Pad)', price: 40, stock: 50 },
        { id: 5, name: 'Yellow Paper (5 sheets)', price: 4, stock: 100 },
        { id: 6, name: 'Pencils', price: 30, stock: 89 },
        { id: 7, name: 'Ballpens', price: 20, stock: 98 },
        { id: 8, name: 'Notebook', price: 60, stock: 95 },
        { id: 9, name: 'Cattleya', price: 40, stock: 60 },
        { id: 10, name: 'Correction Tape', price: 20, stock: 15 },
        { id: 11, name: 'Garbage Bags', price: 40, stock: 75 },
        { id: 12, name: 'Sanitary Napkins', price: 30, stock: 80 },
        { id: 13, name: 'Alcohol', price: 60, stock: 45 },
        { id: 14, name: 'Markers', price: 20, stock: 35 },
        { id: 15, name: 'Wet Wipes', price: 20, stock: 55 },
        { id: 16, name: 'Tissue', price: 20, stock: 120 }
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

const TransparencyLog = require('../models/TransparencyLog');

// 1. GET ALL TRANSPARENCY LEDGER ENTRIES
router.get('/admin/transparency-logs', async (req, res) => {
  try {
    const logs = await TransparencyLog.find().sort({ date: -1 });
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ message: "Failed to load transparency reports ledger entries." });
  }
});

// 2. POST REGISTER A NEW LOG ENTRY
router.post('/admin/transparency-logs/add', async (req, res) => {
  try {
    const { amount, description, receiptUrl, loggedBy } = req.body;
    if (!amount || !description) {
      return res.status(400).json({ message: "Amount and description fields are mandatory." });
    }
    const newLog = new TransparencyLog({
      amount: Number(amount),
      description,
      receiptUrl,
      loggedBy: loggedBy || 'Admin'
    });
    await newLog.save();
    res.json({ success: true, message: "Transaction entry logged successfully!", log: newLog });
  } catch (error) {
    res.status(500).json({ message: "Failed to record transparency transaction parameter logs." });
  }
});

router.get('/admin/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Authorized administrators only.' });
    }

    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) return res.status(404).json({ message: 'Admin account database profile missing' });

    res.json({ success: true, fullName: admin.username });
  } catch (error) {
    res.status(500).json({ message: 'Server error parsing admin authorization tokens' });
  }
});

router.post('/forgot-password-user', async (req, res) => {
  try {
    const { studentNumber, programAndYear, newPassword } = req.body;
    const user = await User.findOne({ studentNumber, role: 'user' });
    if (!user) return res.status(404).json({ message: "Student number not found in our campus records." });

    if (user.programAndYear.toLowerCase().trim() !== programAndYear.toLowerCase().trim()) {
      return res.status(401).json({ message: "Security verification failed: Program & Year mismatch." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt); // FIXED: explicitly tracks newPassword input variable

    user.password = hashedPassword;
    await user.save();
    res.json({ success: true, message: "Password updated successfully! You can now log in." });
  } catch (err) {
    res.status(500).json({ message: "Server error during account recovery execution." });
  }
});

router.get('/admin/lookup-voucher/:token', async (req, res) => {
  try {
    const voucher = await Voucher.findOne({ token: req.params.token.toUpperCase().trim() });
    if (!voucher) return res.status(404).json({ success: false, message: "Voucher reference code not found." });
    if (voucher.isRedeemed) return res.status(400).json({ success: false, message: "This voucher code has already been claimed." });

    res.json({
      success: true,
      voucher: {
        token: voucher.token,
        studentNum: voucher.studentNumber,
        items: voucher.itemsSummary,
        cost: voucher.totalCost
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error querying reference token parameters." });
  }
});

// ==========================================
// HARDWARE MACHINE DEPOSIT ENDPOINT
// ==========================================
router.post('/machine/deposit', async (req, res) => {
  try {
    const { studentNumber, bottlesDeposited } = req.body;
    
    if (!studentNumber || !bottlesDeposited) {
      return res.status(400).json({ message: "Missing student number or bottle counts." });
    }

    // 1. Find the student document record
    const user = await User.findOne({ studentNumber });
    if (!user) return res.status(404).json({ message: "Student account not found." });

    const pointsAwarded = Number(bottlesDeposited) * 2; // 1 Bottle = 2 Points rule

    // 2. RUN BADGE BONUS CHECKER (Updates user object fields if threshold crossed)
    checkAndAwardBadgeBonus(user, pointsAwarded);

    // 3. Process regular bottle addition values
    user.points += pointsAwarded;
    user.totalPointsEarned += pointsAwarded;
    user.recentActivity.push({
      type: "deposit",
      points: pointsAwarded,
      date: new Date(),
      description: `${bottlesDeposited} Bottles Deposited`
    });

    // 4. Save everything together atomically to MongoDB Atlas!
    await user.save();

    res.json({ 
      success: true, 
      message: `Successfully processed ${bottlesDeposited} bottles for ${user.fullName}!` 
    });

  } catch (error) {
    console.error("Machine deposit loop crash:", error);
    res.status(500).json({ message: "Internal server error logging machine deposit stats." });
  }
});

// 1. Start a kiosk session (called when student scans QR)
router.post('/kiosk/start-session', authMiddleware, async (req, res) => {
    try {
        const { kioskId } = req.body;
        const studentNumber = req.user.studentNumber; // from JWT

        // Check if student is banned
        const user = await User.findOne({ studentNumber });
        if (!user) return res.status(404).json({ message: 'Student not found' });

        if (user.bannedUntil && user.bannedUntil > new Date()) {
            const hoursLeft = ((user.bannedUntil - new Date()) / 3600000).toFixed(1);
            return res.status(403).json({ 
                message: `Account banned for ${hoursLeft} more hours due to repeated violations` 
            });
        }

        // Check if kiosk is already busy
        const existing = await KioskSession.findOne({
            kioskId,
            status: { $in: ['pending', 'active'] },
            expiresAt: { $gt: new Date() },
        });

        if (existing) {
            return res.status(409).json({ 
                message: 'Kiosk is busy — another student is currently using it' 
            });
        }

        // Create new session
        const session = await KioskSession.create({
            kioskId,
            studentNumber,
            status: 'pending',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min TTL
        });

        res.json({
            sessionId: session._id,
            studentName: user.fullName,
            points: user.points,
            warnings: user.warnings || 0,
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// 2. Send command to kiosk (called from student's phone)
router.post('/kiosk/command', authMiddleware, async (req, res) => {
    try {
        const { sessionId, command } = req.body;
        // command: "start_deposit", "another", "done", "cancel"

        await KioskSession.updateOne(
            { _id: sessionId },
            { $set: { command } }
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// 3. Get kiosk session status (polled by student's phone every 1s)
router.get('/kiosk/session-status', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.query;
        const session = await KioskSession.findById(sessionId);

        if (!session) return res.status(404).json({ message: 'Session not found' });

        // Also get latest user data
        const user = await User.findOne({ studentNumber: session.studentNumber });

        res.json({
            status: session.status,
            kioskStatus: session.kioskStatus,
            lastResult: session.lastResult,
            points: user?.points || 0,
            warnings: user?.warnings || 0,
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// 4. Update session status (called by kiosk Pi — no auth needed, or use API key)
router.post('/kiosk/status', async (req, res) => {
    try {
        const { kioskId, status, result } = req.body;

        const update = { kioskStatus: status };
        if (result) update.lastResult = result;

        await KioskSession.updateOne(
            { kioskId, status: 'active' },
            { $set: update }
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/admin/confirm-manual-redeem', async (req, res) => {
  try {
    const { token, studentNumber, totalCost, summary } = req.body;

    if (!token || !studentNumber) {
      return res.status(400).json({ success: false, message: "Voucher reference token and student identifier are required." });
    }

    const cleanToken = token.toUpperCase().trim();

    // 1. Verify the voucher exists and hasn't been claimed yet
    const voucher = await Voucher.findOne({ token: cleanToken });
    if (!voucher) return res.status(404).json({ success: false, message: "Voucher reference code not found." });
    if (voucher.isRedeemed) return res.status(400).json({ success: false, message: "This voucher has already been redeemed." });

    // 2. Look up the student and check their points
    const user = await User.findOne({ studentNumber });
    if (!user) return res.status(404).json({ success: false, message: "Student account not found." });
    if (user.points < totalCost) {
      return res.status(400).json({ success: false, message: "Deduction failed: Student has insufficient points live." });
    }

    // 3. Decrement Kiosk inventory stock levels for the manual summary checklist items
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

    // 4. Update the Voucher model state to true
    voucher.isRedeemed = true;
    await voucher.save();

    // 5. Deduct points and push history block simultaneously
    await User.updateOne(
      { studentNumber: studentNumber },
      {
        $inc: { points: -Number(totalCost) }, 
        $push: {
          recentActivity: {
            type: "redeem",
            points: -Number(totalCost), 
            date: new Date(),
            description: `${summary} Redeemed (Manual Entry)`,
            qrReferenceCode: cleanToken 
          }
        }
      }
    );

    res.json({ 
      success: true, 
      message: `Successfully processed manual redemption for ${user.fullName}! Voucher locked.` 
    });

  } catch (error) {
    console.error("Admin manual confirm redemption failure:", error);
    res.status(500).json({ success: false, message: "Server error executing manual confirmation steps." });
  }
});

module.exports = router;