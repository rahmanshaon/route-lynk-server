const jwt = require("jsonwebtoken");
require("dotenv").config();

const verifyToken = (req, res, next) => {
  // Check if header exists
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  // Get token from "Bearer token"
  const token = req.headers.authorization.split(" ")[1];

  // Verify
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

module.exports = verifyToken;
