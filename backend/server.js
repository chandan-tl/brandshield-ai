const express = require("express");
const cors = require("cors");
require("dotenv").config();

const reviewRoutes = require("./routes/reviewRoutes");

const app = express();

// ======================================
// CORS CONFIGURATION
// ======================================

// Production: Set CLIENT_ORIGINS in Render.
// Local development: Allow common Vite ports.

const configuredOrigins =
    process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN;

const allowedOrigins = configuredOrigins
    ? configuredOrigins.split(",").map(origin => origin.trim())
    : [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175"
    ];

app.use(cors({
    origin: (origin, callback) => {

        // Allow requests without an Origin header
        // such as server-to-server health checks.
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(null, false);
    },

    methods: ["GET", "POST", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization"]
}));

// ======================================
// MIDDLEWARE
// ======================================

app.use(express.json({
    limit: "1mb"
}));

// ======================================
// HEALTH CHECK API
// ======================================

app.get("/api/health", (req, res) => {

    res.status(200).json({
        status: "success",
        message: "BrandShield AI Backend is running!",
        environment: process.env.NODE_ENV || "development"
    });

});

// ======================================
// CONTENT REVIEW API
// ======================================

app.use("/api/review", reviewRoutes);

// ======================================
// 404 HANDLER
// ======================================

app.use((req, res) => {

    res.status(404).json({
        success: false,
        message: "API endpoint not found."
    });

});

// ======================================
// GLOBAL ERROR HANDLER
// ======================================

app.use((error, req, res, next) => {

    // Invalid JSON
    if (error instanceof SyntaxError && "body" in error) {

        return res.status(400).json({
            success: false,
            message: "Invalid JSON request body."
        });

    }

    // Request body too large
    if (error.type === "entity.too.large") {

        return res.status(413).json({
            success: false,
            message: "Request is too large. Reduce the submitted content."
        });

    }

    console.error("Unhandled server error:", error);

    return res.status(500).json({
        success: false,
        message: "Unexpected server error."
    });

});

// ======================================
// START SERVER
// ======================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {

    console.log("----------------------------------");
    console.log("       BRANDSHIELD AI SERVER      ");
    console.log("----------------------------------");
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    console.log("----------------------------------");

});