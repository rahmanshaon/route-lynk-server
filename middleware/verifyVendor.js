// Middleware to verify Vendor
const verifyVendor = (usersCollection) => {
  return async (req, res, next) => {
    const email = req.decoded.email;
    const query = { email: email };
    const user = await usersCollection.findOne(query);
    const isVendor = user?.role === "vendor";
    if (!isVendor) {
      return res.status(403).send({ message: "forbidden access" });
    }
    next();
  };
};

module.exports = verifyVendor;
