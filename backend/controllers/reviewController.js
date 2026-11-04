const analyzeContent = require("../services/ruleEngine");
const reviewWithAI = require("../services/aiReview");

const MAX_CONTENT_LENGTH = 12000;

function validateReviewPayload(req, res) {
    const { content, brandRules } = req.body || {};

    if (typeof content !== "string" || !content.trim()) {
        res.status(400).json({
            success: false,
            message: "Please provide content to review.",
        });
        return null;
    }

    if (content.length > MAX_CONTENT_LENGTH) {
        res.status(413).json({
            success: false,
            message: `Content must be ${MAX_CONTENT_LENGTH} characters or fewer.`,
        });
        return null;
    }

    if (!brandRules || typeof brandRules !== "object" || Array.isArray(brandRules)) {
        res.status(400).json({
            success: false,
            message: "Please provide valid brand guidelines.",
        });
        return null;
    }

    return { content, brandRules };
}

// Deterministic checks return quickly and do not depend on the AI provider.
async function reviewContent(req, res) {
    const payload = validateReviewPayload(req, res);
    if (!payload) return;

    try {
        const ruleResults = analyzeContent(
            payload.content,
            payload.brandRules
        );

        return res.status(200).json({
            success: true,
            originalContent: payload.content,
            ruleResults,
        });
    } catch (error) {
        console.error("Rule review error:", error);
        return res.status(500).json({
            success: false,
            message: "Rule-based review failed.",
        });
    }
}

// AI failures are returned as an unavailable result so rule-based findings remain usable.
async function reviewAI(req, res) {
    const { content, brandRules, ruleResults } = req.body;
    const aiResults = await reviewWithAI(
    content,
    brandRules,
    ruleResults
);
    const payload = validateReviewPayload(req, res);
    if (!payload) return;

    try {
        const ruleResults = req.body.ruleResults || null;
        const aiResults = await reviewWithAI(
            payload.content,
            payload.brandRules,
            ruleResults
        );

        return res.status(200).json({
            success: true,
            aiResults,
        });
    } catch (error) {
        console.error("AI controller error:", error);
        return res.status(200).json({
            success: true,
            aiResults: {
                available: false,
                summary: "AI analysis could not be completed. Rule-based results are still available.",
                error: "Please retry AI analysis later.",
                recommendations: [],
            },
        });
    }
}

module.exports = {
    reviewContent,
    reviewAI,
};
