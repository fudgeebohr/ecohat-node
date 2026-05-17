const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  studentNumber: {
    type: String,
    required: true,
    unique: true, 
    trim: true
  },
  programAndYear: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  points: {
    type: Number,
    default: 0 
  },
  totalPointsEarned: {
    type: Number,
    default: 0
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  recentActivity: [
    {
      action: String,
      date: { type: Date, default: Date.now },
      pointsEarned: Number
    }
  ],
  privacyMode: { 
      type: Boolean, 
      default: false 
  },
  isArchived: { 
    type: Boolean, 
    default: false 
  }
  cart: [
    {
      itemId: { type: Number, required: true }, // Matches your item.id
      name: { type: String, required: true },
      price: { type: Number, required: true },
      quantity: { type: Number, required: true, default: 1 }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);