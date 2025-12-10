const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// --- App Configuration ---
const app = express();
const port = process.env.PORT || 5000;

// --- Middleware ---
app.use(cors());
app.use(express.json());
const verifyToken = require("./middleware/verifyToken");

// --- Database Configuration ---
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    // --- Collections ---
    const db = client.db("routeLynkDB");
    const usersCollection = db.collection("users");
    const ticketsCollection = db.collection("tickets");
    const bookingsCollection = db.collection("bookings");
    const paymentsCollection = db.collection("payments");

    console.log("Connected to MongoDB successfully!");

    // ==============================================================
    //                     JWT AUTHENTICATION API
    // ==============================================================

    // Generate Token on Login
    app.post("/jwt", async (req, res) => {
      const user = req.body;

      // Generate token valid for 1 hour
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // ==============================================================
    //                     USER MANAGEMENT APIs
    // ==============================================================

    // Save or Update User (Upsert) - Public (accessible during Register/Login)
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

    // Get User Details (Role Check)
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // Get All Users (Admin Only) - <--- PROTECTED
    app.get("/users", verifyToken, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // Update User Role (Make Admin/Vendor) - <--- PROTECTED
    app.patch("/users/role/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { role: role },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Mark Vendor as Fraud - <--- PROTECTED
    app.patch("/users/fraud/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { email } = req.body;
      const query = { _id: new ObjectId(id) };

      // Update User Role to 'fraud'
      const updateDoc = {
        $set: { role: "fraud", status: "banned" },
      };
      const userResult = await usersCollection.updateOne(query, updateDoc);

      // Hide/Reject All Tickets by this Vendor
      const ticketQuery = { "vendor.email": email };
      const ticketUpdate = {
        $set: { status: "rejected" },
      };
      const ticketResult = await ticketsCollection.updateMany(
        ticketQuery,
        ticketUpdate
      );

      res.send({ userResult, ticketResult });
    });

    // ==============================================================
    //                     TICKET MANAGEMENT APIs
    // ==============================================================

    // Get Advertised Tickets (Public)
    app.get("/tickets/advertised", async (req, res) => {
      const query = { status: "approved", isAdvertised: true };
      const result = await ticketsCollection.find(query).limit(6).toArray();
      res.send(result);
    });

    // Get Latest Tickets (Public)
    app.get("/tickets/latest", async (req, res) => {
      const query = { status: "approved" };
      const result = await ticketsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // Get All Tickets (Admin) - <--- PROTECTED
    app.get("/tickets/admin", verifyToken, async (req, res) => {
      const result = await ticketsCollection.find().toArray();
      res.send(result);
    });

    // Get Tickets by Vendor Email - <--- PROTECTED
    app.get("/tickets/vendor/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { "vendor.email": email };
      const result = await ticketsCollection.find(query).toArray();
      res.send(result);
    });

    // Public Search & Filter API (All Tickets Page)
    app.get("/tickets", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 6;
      const skip = (page - 1) * limit;

      const { from, to, type, sort } = req.query;
      const query = { status: "approved" };

      // Search Logic
      if (from) query.from = { $regex: from, $options: "i" };
      if (to) query.to = { $regex: to, $options: "i" };

      // Filter Logic
      if (type) query.transportType = type;

      // Sort Logic
      let sortOptions = { departureDate: 1 };
      if (sort === "asc") sortOptions = { price: 1 };
      if (sort === "desc") sortOptions = { price: -1 };

      const result = await ticketsCollection
        .find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .toArray();
      const total = await ticketsCollection.countDocuments(query);

      res.send({
        tickets: result,
        totalTickets: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
      });
    });

    // Get Single Ticket Details
    app.get("/tickets/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid Ticket ID" });
      }
      const query = { _id: new ObjectId(id) };
      const result = await ticketsCollection.findOne(query);
      res.send(result);
    });

    // Create New Ticket (Vendor) - <--- PROTECTED
    app.post("/tickets", verifyToken, async (req, res) => {
      const ticket = req.body;
      ticket.status = "pending";
      ticket.isAdvertised = false;
      ticket.createdAt = new Date();
      const result = await ticketsCollection.insertOne(ticket);
      res.send(result);
    });

    // Update Ticket (Vendor) - <--- PROTECTED
    app.patch("/tickets/update/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const query = { _id: new ObjectId(id) };
      
      const updateDoc = {
        $set: {
          title: updatedData.title,
          from: updatedData.from,
          to: updatedData.to,
          transportType: updatedData.transportType,
          price: updatedData.price,
          quantity: updatedData.quantity,
          departureDate: updatedData.departureDate,
          departureTime: updatedData.departureTime,
          description: updatedData.description,
          perks: updatedData.perks,
          image: updatedData.image,
        }
      };

      const result = await ticketsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Delete Ticket - <--- PROTECTED
    app.delete("/tickets/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ticketsCollection.deleteOne(query);
      res.send(result);
    });

    // Update Ticket Status (Admin) - <--- PROTECTED
    app.patch("/tickets/status/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status: status } };
      const result = await ticketsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Toggle Advertisement Status (Admin) - <--- PROTECTED
    app.patch("/tickets/advertise/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { isAdvertised } = req.body;
      const query = { _id: new ObjectId(id) };

      if (isAdvertised) {
        const count = await ticketsCollection.countDocuments({
          isAdvertised: true,
        });
        if (count >= 6) return res.send({ limitReached: true });
      }

      const updateDoc = { $set: { isAdvertised: isAdvertised } };
      const result = await ticketsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // ==============================================================
    //                     BOOKING MANAGEMENT APIs
    // ==============================================================

    // Create Booking - <--- PROTECTED
    app.post("/bookings", verifyToken, async (req, res) => {
      const booking = req.body;
      booking.status = "pending";
      booking.bookedAt = new Date();
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    // Get User's Bookings - <--- PROTECTED
    app.get("/bookings/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    // Get Vendor's Booking Requests - <--- PROTECTED
    app.get("/bookings/vendor/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { vendorEmail: email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    // Update Booking Status (Vendor Accept/Reject) - <--- PROTECTED
    app.patch("/bookings/status/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status: status } };
      const result = await bookingsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // ==============================================================
    //                     PAYMENT SYSTEM APIs
    // ==============================================================

    // Create Payment (Stripe) - <--- PROTECTED
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "bdt",
        payment_method_types: ["card"],
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // Process Successful Payment (Transaction) - <--- PROTECTED
    app.post("/payments", verifyToken, async (req, res) => {
      const payment = req.body;

      // Save Payment Record
      const insertResult = await paymentsCollection.insertOne(payment);

      // Update Booking Status -> 'paid'
      const bookingQuery = { _id: new ObjectId(payment.bookingId) };
      const updatedBooking = {
        $set: { status: "paid", transactionId: payment.transactionId },
      };
      await bookingsCollection.updateOne(bookingQuery, updatedBooking);

      // Reduce Ticket Quantity
      const ticketQuery = { _id: new ObjectId(payment.ticketId) };
      const updateTicket = { $inc: { quantity: -payment.quantity } };
      const ticketResult = await ticketsCollection.updateOne(
        ticketQuery,
        updateTicket
      );

      res.send({ insertResult, ticketResult });
    });

    // Get User Payment History - <--- PROTECTED
    app.get("/payments/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const result = await paymentsCollection
        .find(query)
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    // Get Vendor Revenue Stats - <--- PROTECTED
    app.get("/vendor-stats/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      // Stats Aggregation
      const payments = await paymentsCollection
        .find({ vendorEmail: email })
        .toArray();
      const totalRevenue = payments.reduce((sum, item) => sum + item.price, 0);
      const totalSold = payments.reduce((sum, item) => sum + item.quantity, 0);

      const totalAdded = await ticketsCollection.countDocuments({
        "vendor.email": email,
      });

      const pendingRequests = await bookingsCollection.countDocuments({
        vendorEmail: email,
        status: "pending",
      });

      res.send({ totalRevenue, totalSold, totalAdded, pendingRequests });
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

// Root Route
app.get("/", (req, res) => {
  res.send("RouteLynk Server is Running...");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
