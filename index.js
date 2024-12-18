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
const { ConversationContextImpl } = require("twilio/lib/rest/conversations/v1/conversation");
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
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

let lastLocation = null;
let lastQrData = null;

app.post("/update-location", (req, res) => {
  console.log("Received location update:", typeof req.body, req.body);

  let locations;
  try {
    locations = JSON.parse(req.body.locations);
  } catch (error) {
    console.error("Error parsing locations:", error);
    return res.status(400).json({ error: "Invalid location data format." });
  }

  if (!locations || !Array.isArray(locations) || locations.length === 0) {
    console.error("No valid location data provided.");
    return res.status(400).json({ error: "No valid location data provided." });
  }

  const { latitude, longitude, accuracy, speed, timestamp } =
    locations[locations.length - 1];

  if (latitude === undefined || longitude === undefined) {
    console.error("Latitude and longitude are required.");
    return res
      .status(400)
      .json({ error: "Latitude and longitude are required." });
  }

  lastLocation = { latitude, longitude, accuracy, speed, timestamp };

  io.emit("locationUpdate", lastLocation);

  return res
    .status(200)
    .json({ success: true, message: "Location updated successfully." });
});

app.get("/last-location", (req, res) => {
  if (lastLocation) {
    io.emit("fetchLastLocation", lastLocation);
    return res.status(200).json(lastLocation);
  }
});

app.post("/update-qr", async (req, res) => {
  const qrData = req.body;
  if (typeof qrData === "string") {
    try {
      console.log("Received QR data:", qrData);
      qrData = JSON.parse(qrData);
    } catch (err) {
      return res.status(400).json({ error: "Invalid QR data format." });
    }
  }

  if (
    !qrData ||
    !qrData.batchId ||
    !qrData.name ||
    !qrData.manufacturer ||
    !qrData.manufacturingDate ||
    !qrData.expiryDate
  ) {
    return res.status(400).json({ error: "Incomplete or invalid QR data." });
  }

  if (!qrData) {
    return res.status(400).json({ error: "QR data is required." });
  }

  try {
    lastQrData = qrData;
    io.emit("qrDataUpdate", { qrData });
    
    await createTransaction(qrData);

    return res.status(200).json({ success: true, data: qrData });
  } catch (error) {
    console.error("Error in /update-qr:", error.message || error);
    return res.status(500).json({ error: "Failed to process QR data." });
  }
});

app.get("/last-qr", (req, res) => {
  if (lastQrData) {
    return res.status(200).json(lastQrData);
  }
  return res.status(404).json({ error: "No QR data available." });
});

const createTransaction = async (qrData) => {
  try {
    const { batchId, name, manufacturer, manufacturingDate, expiryDate } =
      qrData;
    const manufacturingTimestamp = Math.floor(
      new Date(manufacturingDate).getTime() / 1000
    );
    const expiryTimestamp = Math.floor(new Date(expiryDate).getTime() / 1000);
    console.log(
      "Received from qrData:",
      batchId,
      name,
      manufacturer,
      manufacturingTimestamp,
      expiryTimestamp
    );

    // Add medicine details to the blockchain
    const tx = await contract.registerMedicine(
      batchId,
      name,
      manufacturer,
      manufacturingTimestamp,
      expiryTimestamp
    );
    console.log("before await");
    await tx.wait();
    console.log("past  await");

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
