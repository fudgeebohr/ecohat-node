const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');

const authMiddleware = require('./middleware/auth');

const app = express();

// Middleware
app.use(cors({
  origin: ['https://eco-hat.onrender.com', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`);
  next();
});

app.use('/api/auth', authRoutes);

app.use('/api', authMiddleware);  // Apply auth to all /api routes

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB via Compass'))
    .catch((err) => console.error('Connection error:', err));

// Basic Route for testing
app.get('/', (req, res) => {
    res.send('ECO-HAT Server is running!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is active on port ${PORT}`);
});