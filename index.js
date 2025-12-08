const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
    const bookingsCollection = db.collection("bookings");
    const paymentsCollection = db.collection("payments");

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

    // Get Tickets by Vendor Email (GET)
    app.get("/tickets/vendor/:email", async (req, res) => {
      const email = req.params.email;
      const query = { "vendor.email": email };
      const result = await ticketsCollection.find(query).toArray();
      res.send(result);
    });

    // Delete Ticket (DELETE)
    app.delete("/tickets/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ticketsCollection.deleteOne(query);
      res.send(result);
    });

    // Get ALL Tickets (For Admin)
    app.get("/tickets/admin", async (req, res) => {
      const result = await ticketsCollection.find().toArray();
      res.send(result);
    });

    // Update Ticket Status (Approve/Reject)
    app.patch("/tickets/status/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: status },
      };
      const result = await ticketsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Get Public Tickets (Approved + Search/Sort/Filter/Pagination)
    app.get("/tickets", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 6;
      const skip = (page - 1) * limit;

      const { from, to, type, sort } = req.query;

      // Base Query: Only show Approved tickets
      const query = { status: "approved" };

      // Search Logic (Case Insensitive Regex)
      if (from) query.from = { $regex: from, $options: "i" };
      if (to) query.to = { $regex: to, $options: "i" };

      // Filter Logic
      if (type) query.transportType = type;

      // Sort Logic
      let sortOptions = { departureDate: 1 }; // Default: Sooner dates first
      if (sort === "asc") sortOptions = { price: 1 }; // Low to High
      if (sort === "desc") sortOptions = { price: -1 }; // High to Low

      // Execute Query
      const result = await ticketsCollection
        .find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .toArray();

      // Get Total Count for Pagination
      const total = await ticketsCollection.countDocuments(query);

      res.send({
        tickets: result,
        totalTickets: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
      });
    });

    // 7. Get Single Ticket by ID
    app.get("/tickets/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ticketsCollection.findOne(query);
      res.send(result);
    });

    // --- BOOKING APIs ---

    // Create a Booking (POST)
    app.post("/bookings", async (req, res) => {
      const booking = req.body;

      booking.status = "pending";
      booking.bookedAt = new Date();

      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    // Get Bookings by User Email (For My Bookings)
    app.get("/bookings/user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    // Get Bookings by Vendor Email (For Vendor Requests)
    app.get("/bookings/vendor/:email", async (req, res) => {
      const email = req.params.email;
      const query = { vendorEmail: email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    // Update Booking Status (Accept/Reject)
    app.patch("/bookings/status/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: status },
      };
      const result = await bookingsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // --- PAYMENT APIs ---

    // Create Payment Intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "bdt",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // Save Payment Info
    app.post("/payments", async (req, res) => {
      const payment = req.body;

      // Save to Payments Collection
      const insertResult = await paymentsCollection.insertOne(payment);

      // Update Booking Status to 'paid'
      const query = { _id: new ObjectId(payment.bookingId) };
      const updatedBooking = {
        $set: {
          status: "paid",
          transactionId: payment.transactionId,
        },
      };
      const bookingResult = await bookingsCollection.updateOne(
        query,
        updatedBooking
      );

      // Reduce Ticket Quantity
      const ticketQuery = { _id: new ObjectId(payment.ticketId) };
      const updateTicket = {
        $inc: { quantity: -payment.quantity }, // Decrease quantity
      };
      const ticketResult = await ticketsCollection.updateOne(
        ticketQuery,
        updateTicket
      );

      res.send({ insertResult, bookingResult, ticketResult });
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
