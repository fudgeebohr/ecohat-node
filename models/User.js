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
  ]
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);