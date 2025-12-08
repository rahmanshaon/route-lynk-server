const express = require("express");
const cors = require("cors");
require("dotenv").config();

// Initialize the Express app
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Basic Route
app.get("/", (req, res) => {
  res.send("RouteLynk Server is Running");
});

// Start Server
app.listen(port, () => {
  console.log(`RouteLynk is running on port ${port}`);
});