const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json()); // Allows the server to read JSON from the frontend
app.use(cors());        // Allows your React app to talk to this server

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