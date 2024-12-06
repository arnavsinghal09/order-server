const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const cors = require("cors");

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
  console.log("Received location update:", req.body);

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
app.post("/update-qr", (req, res) => {
  const { qrData } = req.body;
  if (!qrData) {
    return res.status(400).json({ error: "QR data is required." });
  }

  // Store the QR data
  lastQrData = qrData;

  console.log("Received QR code data:", qrData);

  // Emit the QR data to connected clients
  io.emit("qrDataUpdate", { qrData });

  res.status(200).json({ success: true, data: qrData });
});

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
