const mongoose = require('mongoose');

const kioskSessionSchema = new mongoose.Schema({
    kioskId: { type: String, required: true },
    studentNumber: { type: String, required: true },
    status: { type: String, default: 'pending', enum: ['pending', 'active', 'completed'] },
    command: { type: String, default: null },
    kioskStatus: { type: String, default: null },
    lastResult: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
});

module.exports = mongoose.model('KioskSession', kioskSessionSchema, 'kiosk_sessions');