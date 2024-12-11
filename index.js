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

// Endpoint to update QR data
app.post("/update-qr", async (req, res) => {
  const qrData = req.body;
  if (!qrData) {
    return res.status(400).json({ error: "QR data is required." });
  }

  // Store the QR data
  lastQrData = qrData;

  console.log("Received QR code data:", qrData);

  // Emit the QR data to connected clients
  io.emit("qrDataUpdate", { qrData });

  // Pass qrData directly to the createTransaction function
  await createTransaction(qrData);
  res.status(200).json({ success: true, data: qrData });
});

// Endpoint to get the last QR data
app.get("/last-qr", (req, res) => {
  if (lastQrData) {
    res.json({ success: true, data: lastQrData });
  } else {
    // Send dummy data with null values when no QR data is available
    res.json({
      success: true,
      data: {
        batchId: "DUMMY_BATCH_ID",
        name: "DUMMY_PRODUCT_NAME",
        manufacturer: "DUMMY_MANUFACTURER",
        manufacturingDate: "2024-01-01T00:00:00.000Z", // Example ISO format
        expiryDate: "2025-01-01T00:00:00.000Z", // Example ISO format
        contractAddress: "0xDUMMY_CONTRACT_ADDRESS",
        journeySteps: [
          {
            stepId: "1",
            location: "DUMMY_LOCATION_1",
            description: "DUMMY_DESCRIPTION_1",
            timestamp: "2024-01-02T12:00:00.000Z",
          },
          {
            stepId: "2",
            location: "DUMMY_LOCATION_2",
            description: "DUMMY_DESCRIPTION_2",
            timestamp: "2024-01-03T15:30:00.000Z",
          },
        ],
        department: "DUMMY_DEPARTMENT",
        item_name: "DUMMY_ITEM_NAME",
        batch_number: "DUMMY_BATCH_NUMBER",
        expiry_date: "2023-12-31", // Example expiry date
        quantity: 999,
        unit_price: 99.99,
        supplier: "DUMMY_SUPPLIER",
        category: "DUMMY_CATEGORY",
      },
    });
  }

  // Emit the last QR data to connected clients
  if (lastQrData) {
    io.emit("fetchLastQrData", { qrData: lastQrData });
  } else {
    // Emit dummy data to connected clients when no QR data is available
    io.emit("fetchLastQrData", {
      qrData: {
        success: true,
        data: {
          batchId: "DUMMY_BATCH_ID",
          name: "DUMMY_PRODUCT_NAME",
          manufacturer: "DUMMY_MANUFACTURER",
          manufacturingDate: "2024-01-01T00:00:00.000Z", // Example ISO format
          expiryDate: "2025-01-01T00:00:00.000Z", // Example ISO format
          contractAddress: "0xDUMMY_CONTRACT_ADDRESS",
          journeySteps: [
            {
              stepId: "1",
              location: "DUMMY_LOCATION_1",
              description: "DUMMY_DESCRIPTION_1",
              timestamp: "2024-01-02T12:00:00.000Z",
            },
            {
              stepId: "2",
              location: "DUMMY_LOCATION_2",
              description: "DUMMY_DESCRIPTION_2",
              timestamp: "2024-01-03T15:30:00.000Z",
            },
          ],
          department: "DUMMY_DEPARTMENT",
          item_name: "DUMMY_ITEM_NAME",
          batch_number: "DUMMY_BATCH_NUMBER",
          expiry_date: "2023-12-31", // Example expiry date
          quantity: 999,
          unit_price: 99.99,
          supplier: "DUMMY_SUPPLIER",
          category: "DUMMY_CATEGORY",
        },
      },
    });
  }
});

// Blockchain Transaction Creation
const createTransaction = async (qrData) => {
  // Validate that qrData exists and contains the required fields

  // Ensure qrData is parsed as JSON
  if (typeof qrData.qrData === "string") {
    try {
      qrData = JSON.parse(qrData.qrData);
    } catch (err) {
      console.error("Error parsing qrData JSON:", err.message);
      return;
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

    return;
  }

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
