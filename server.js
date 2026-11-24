const express = require("express");
const path = require("path");
const connectDatabase = require("./database");

const app = express();

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "RS PAY",
    database:
      require("mongoose").connection.readyState === 1
        ? "connected"
        : "disconnected"
  });
});

app.get("/api/services", (req, res) => {
  res.json({
    success: true,
    services: [
      "Mobile Recharge",
      "Electricity Bill",
      "Gas Bill",
      "Water Bill",
      "Internet Bill",
      "TV Services",
      "Education Fees"
    ]
  });
});

app.get("/api", (req, res) => {
  res.json({
    name: "RS PAY",
    message: "Digital Payment Platform API",
    version: "1.0.0"
  });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await connectDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`RS PAY running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
