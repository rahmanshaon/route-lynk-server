const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

// Initialize the Express app
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("routeLynkDB");
    const usersCollection = db.collection("users");
    const ticketsCollection = db.collection("tickets");

    console.log("Connected to MongoDB successfully!");

    // --- User Related APIs ---

    // Save User to DB
    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email: email };

      const options = { upsert: true };

      const updateDoc = {
        $set: {
          name: user.name,
          image: user.image,
          email: user.email,
          lastLogin: new Date(),
        },
        $setOnInsert: {
          role: "user",
          timestamp: new Date(),
        },
      };

      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // Get User by Email (to check role)
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // --- TICKET Related APIs ---

    // Create a Ticket (POST)
    app.post("/tickets", async (req, res) => {
      const ticket = req.body;

      // Default status for new tickets
      ticket.status = "pending";
      ticket.isAdvertised = false;
      ticket.createdAt = new Date();

      const result = await ticketsCollection.insertOne(ticket);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

// Basic Route
app.get("/", (req, res) => {
  res.send("RouteLynk Server is Running...");
});

// Start Server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
