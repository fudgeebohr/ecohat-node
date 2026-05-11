const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  // Inside your UserSchema in models/User.js
  role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
  },

  fullName: {
    type: String,
    required: true,
    trim: true
  },
  studentNumber: {
    type: String,
    required: true,
    unique: true, // Prevents duplicate registrations
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
    default: 0 // New students start with 0 points
  },
  recentActivity: [
    {
      action: String, // e.g., "Deposited PET Bottle"
      date: { type: Date, default: Date.now },
      pointsEarned: Number
    }
  ]
}, { timestamps: true }); // Automatically adds 'createdAt' and 'updatedAt'

module.exports = mongoose.model('User', UserSchema);