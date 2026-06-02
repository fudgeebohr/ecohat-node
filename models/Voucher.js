const mongoose = require('mongoose');

const VoucherSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  studentNumber: { type: String, required: true },
  itemsSummary: { type: String, required: true },
  totalCost: { type: Number, required: true },
  isRedeemed: { type: Boolean, default: false },
  dateCreated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Voucher', VoucherSchema, 'vouchers');