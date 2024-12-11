const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const cors = require("cors");

// Blockchain
const { ethers } = require("ethers");
const { JsonRpcProvider } = require("ethers");
// Import contract ABI
const contractData = require("./MedicineTrackerABI.json");
const contractABI = contractData.abi;

// Ethereum setup
const CONTRACT_ADDRESS = "0xA3D7d9b212EB3eBF5fb27fC09aA1B3aa7d013d64";
const PRIVATE_KEY =
  "0f4307ef7dee539cfdd566f1c1ebfb82c0a1e1a57523d012b339926d524f5743";
const RPC_URL = "https://rpc-amoy.polygon.technology";

// Initialize provider and wallet
const provider = new JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, wallet);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow requests from any origin
    methods: ["GET", "POST"],
  },
});

// Use CORS middleware
app.use(
  cors({
    origin: "*", // Allows requests from any origin
  })
);

// Parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, "public")));

let lastLocation = null;
let lastQrData = null;

// Endpoint to update location
app.post("/update-location", (req, res) => {
  console.log("Received location update:", typeof req.body, req.body);

  // Parse the locations from the string
  let locations;
  try {
    locations = JSON.parse(req.body.locations);
  } catch (error) {
    console.error("Error parsing locations:", error);
    return res.status(400).json({ error: "Invalid location data format." });
  }

  // Validate required fields
  if (!locations || !Array.isArray(locations) || locations.length === 0) {
    console.error("No valid location data provided.");
    return res.status(400).json({ error: "No valid location data provided." });
  }

  // Extract the last location from the array
  const { latitude, longitude, accuracy, speed, timestamp } =
    locations[locations.length - 1];

  if (latitude === undefined || longitude === undefined) {
    console.error("Latitude and longitude are required.");
    return res
      .status(400)
      .json({ error: "Latitude and longitude are required." });
  }

  // Store the last location
  lastLocation = { latitude, longitude, accuracy, speed, timestamp };

  // Emit location update to clients
  io.emit("locationUpdate", lastLocation);

  // Send a response indicating success
  res
    .status(200)
    .json({ success: true, message: "Location updated successfully." });
});

// Endpoint to get the last location
app.get("/last-location", (req, res) => {
  res.json(lastLocation);

  // Emit the last location to connected clients
  if (lastLocation) {
    io.emit("fetchLastLocation", lastLocation);
  }
});

// Endpoint to update QR data and create a blockchain transaction
app.post("/update-qr", (req, res) => {
  const qrData = req.body;
  if (!qrData) {
    return res.status(400).json({ error: "QR data is required." });
  }

  // Store the QR data
  lastQrData = qrData;
  createTransaction(qrData);
  console.log("Received QR code data:", qrData);

  return res.status(200).json({ success: true, data: qrData });

  // Pass qrData directly to the createTransaction function

});

// Blockchain Transaction Creation
const createTransaction = async (qrData) => {
  // Validate that qrData exists and contains the required fields
  if (
    !qrData ||
    !qrData.batchId ||
    !qrData.name ||
    !qrData.manufacturer ||
    !qrData.manufacturingDate ||
    !qrData.expiryDate
  ) {
    console.log("Error: Missing required fields in qrData JSON.");
    return;
  }

  try {
    const { batchId, name, manufacturer, manufacturingDate, expiryDate } =
      qrData;

    console.log(
      "Received from qrData:",
      batchId,
      name,
      manufacturer,
      manufacturingDate,
      expiryDate
    );

    // Add medicine details to the blockchain
    const tx = await contract.registerMedicine(
      batchId,
      name,
      manufacturer,
      manufacturingDate,
      expiryDate
    );
    await tx.wait();
    console.log("Transaction successful with hash:", tx.hash);
  } catch (err) {
    console.error("Error in createTransaction:", err.message || err);
  }
};

// Broadcast connection info
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Optionally send the latest data when a client connects
  if (lastLocation) {
    socket.emit("locationUpdate", lastLocation);
  }

  if (lastQrData) {
    socket.emit("qrDataUpdate", { qrData: lastQrData });
  }

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
