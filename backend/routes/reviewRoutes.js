const express = require("express");
const router = express.Router();

const {
    reviewContent,
    reviewAI,
} = require("../controllers/reviewController");

// Fast deterministic checks.
router.post("/", reviewContent);

// Separate AI analysis and AI retry endpoint.
router.post("/ai", reviewAI);

module.exports = router;
