const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true }, // Matches rewardItems ids (1, 2, 3...)
  name: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, required: true, default: 100 }
}, { timestamps: true });

module.exports = mongoose.model('Item', ItemSchema);