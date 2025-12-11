// Middleware to verify Admin
const verifyAdmin = (usersCollection) => {
  return async (req, res, next) => {
    const email = req.decoded.email;
    const query = { email: email };
    const user = await usersCollection.findOne(query);
    const isAdmin = user?.role === "admin";
    if (!isAdmin) {
      return res.status(403).send({ message: "forbidden access" });
    }
    next();
  };
};

module.exports = verifyAdmin;