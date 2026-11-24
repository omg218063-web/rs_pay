const mongoose = require("mongoose");

async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.DB_NAME || "rs_pay",
    serverSelectionTimeoutMS: 10000
  });

  console.log("RS PAY MongoDB Connected");
}

module.exports = connectDatabase;
