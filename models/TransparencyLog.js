const mongoose = require('mongoose');

const TransparencyLogSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  receiptUrl: { type: String, default: null }, // Stores base64 encoding or Render storage file url
  loggedBy: { type: String, default: 'Admin' }, // Tracks which admin registered the entry
  date: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('TransparencyLog', TransparencyLogSchema);