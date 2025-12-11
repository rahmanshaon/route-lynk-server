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

// Import Middlewares
const verifyToken = require("./middleware/verifyToken");
const verifyAdminFactory = require("./middleware/verifyAdmin");
const verifyVendorFactory = require("./middleware/verifyVendor");

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

    // --- Initialize Role Middlewares with DB Collection ---
    const verifyAdmin = verifyAdminFactory(usersCollection);
    const verifyVendor = verifyVendorFactory(usersCollection);

    // ==============================================================
    //                     JWT AUTHENTICATION API
    // ==============================================================

    // Generate Token on Login
    app.post("/jwt", async (req, res) => {
      const user = req.body;

      // Generate token valid for 1 day
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      res.send({ token });
    });

    // ==============================================================
    //                     USER MANAGEMENT APIs
    // ==============================================================

    // Save/Update User (Public/Auth)
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

    // Get User Details
    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // ADMIN ONLY: Get All Users
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // ADMIN ONLY: Update User Role
    app.patch("/users/role/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { role: role },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // ADMIN ONLY: Mark Vendor as Fraud
    app.patch(
      "/users/fraud/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { email } = req.body;
        const query = { _id: new ObjectId(id) };

        // Ban User
        const updateDoc = {
          $set: { role: "fraud", status: "banned" },
        };
        const userResult = await usersCollection.updateOne(query, updateDoc);

        // Reject all their tickets
        const ticketQuery = { "vendor.email": email };
        const ticketUpdate = {
          $set: { status: "rejected" },
        };
        const ticketResult = await ticketsCollection.updateMany(
          ticketQuery,
          ticketUpdate
        );

        res.send({ userResult, ticketResult });
      }
    );

    // ==============================================================
    //                     TICKET MANAGEMENT APIs
    // ==============================================================

    // Public: Advertised Tickets
    app.get("/tickets/advertised", async (req, res) => {
      const query = { status: "approved", isAdvertised: true };
      const result = await ticketsCollection.find(query).limit(6).toArray();
      res.send(result);
    });

    // Public: Latest Tickets
    app.get("/tickets/latest", async (req, res) => {
      const query = { status: "approved" };
      const result = await ticketsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // ADMIN ONLY: Get All Tickets for Management
    app.get("/tickets/admin", verifyToken, verifyAdmin, async (req, res) => {
      const result = await ticketsCollection.find().toArray();
      res.send(result);
    });

    // VENDOR ONLY: Get My Tickets
    app.get(
      "/tickets/vendor/:email",
      verifyToken,
      verifyVendor,
      async (req, res) => {
        const email = req.params.email;
        const query = { "vendor.email": email };
        const result = await ticketsCollection.find(query).toArray();
        res.send(result);
      }
    );

    // Public: Search & Filter (All Tickets Page)
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

    // Public: Single Ticket Details
    app.get("/tickets/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid Ticket ID" });
      }
      const query = { _id: new ObjectId(id) };
      const result = await ticketsCollection.findOne(query);
      res.send(result);
    });

    // VENDOR ONLY: Add Ticket
    app.post("/tickets", verifyToken, verifyVendor, async (req, res) => {
      const ticket = req.body;
      ticket.status = "pending";
      ticket.isAdvertised = false;
      ticket.createdAt = new Date();
      const result = await ticketsCollection.insertOne(ticket);
      res.send(result);
    });

    // VENDOR ONLY: Update Ticket
    app.patch(
      "/tickets/update/:id",
      verifyToken,
      verifyVendor,
      async (req, res) => {
        const id = req.params.id;
        const updatedData = req.body;
        const query = { _id: new ObjectId(id) };

        // Fetch the existing ticket first
        const existingTicket = await ticketsCollection.findOne(query);

        if (!existingTicket) {
          return res.status(404).send({ message: "Ticket not found" });
        }

        // SECURITY CHECK: Check if status is rejected
        if (existingTicket.status === "rejected") {
          return res
            .status(403)
            .send({ message: "You cannot edit a rejected ticket." });
        }

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
          },
        };

        const result = await ticketsCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    // VENDOR ONLY: Delete Ticket
    app.delete("/tickets/:id", verifyToken, verifyVendor, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ticketsCollection.deleteOne(query);
      res.send(result);
    });

    // ADMIN ONLY: Approve/Reject Ticket
    app.patch(
      "/tickets/status/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { status } = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = { $set: { status: status } };
        const result = await ticketsCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    // ADMIN ONLY: Toggle Advertisement
    app.patch(
      "/tickets/advertise/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
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
      }
    );

    // ==============================================================
    //                     BOOKING MANAGEMENT APIs
    // ==============================================================

    // Create Booking (Any User) - Includes Stock Check
    app.post("/bookings", verifyToken, async (req, res) => {
      const booking = req.body;

      const ticket = await ticketsCollection.findOne({
        _id: new ObjectId(booking.ticketId),
      });

      if (!ticket) {
        return res.status(404).send({ message: "Ticket not found" });
      }

      // Stock Check
      if (ticket.quantity < booking.quantity) {
        return res
          .status(400)
          .send({ message: "Not enough tickets available" });
      }

      // SECURITY CHECK: Date Validation
      const departureDate = new Date(ticket.departureDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (departureDate < today) {
        return res
          .status(400)
          .send({ message: "This ticket has already expired." });
      }

      booking.status = "pending";
      booking.bookedAt = new Date();
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    // Get User's Bookings
    app.get("/bookings/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { userEmail: email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    // VENDOR ONLY: Get Requests
    app.get(
      "/bookings/vendor/:email",
      verifyToken,
      verifyVendor,
      async (req, res) => {
        const email = req.params.email;
        const query = { vendorEmail: email };
        const result = await bookingsCollection.find(query).toArray();
        res.send(result);
      }
    );

    // VENDOR ONLY: Accept/Reject Booking
    app.patch(
      "/bookings/status/:id",
      verifyToken,
      verifyVendor,
      async (req, res) => {
        const id = req.params.id;
        const { status } = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = { $set: { status: status } };
        const result = await bookingsCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    // ==============================================================
    //                     PAYMENT SYSTEM APIs
    // ==============================================================

    // Create Payment Intent
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

    // Process Payment
    app.post("/payments", verifyToken, async (req, res) => {
      const payment = req.body;

      // Save Payment
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

    // Get User Payment History
    app.get("/payments/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { userEmail: email };
      const result = await paymentsCollection
        .find(query)
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    // VENDOR ONLY: Revenue Stats
    app.get(
      "/vendor-stats/:email",
      verifyToken,
      verifyVendor,
      async (req, res) => {
        const email = req.params.email;

        const payments = await paymentsCollection
          .find({ vendorEmail: email })
          .toArray();
        const totalRevenue = payments.reduce(
          (sum, item) => sum + item.price,
          0
        );
        const totalSold = payments.reduce(
          (sum, item) => sum + item.quantity,
          0
        );

        const totalAdded = await ticketsCollection.countDocuments({
          "vendor.email": email,
        });

        const pendingRequests = await bookingsCollection.countDocuments({
          vendorEmail: email,
          status: "pending",
        });

        res.send({ totalRevenue, totalSold, totalAdded, pendingRequests });
      }
    );

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
