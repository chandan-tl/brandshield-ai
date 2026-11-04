const reviewWithGemini = require("./geminiService");
const reviewWithOpenAI = require("./openaiService");

async function reviewWithAI(content, brandRules, ruleResults = null) {

    // First provider: Gemini
    try {

        console.log("--------------------------------");
        console.log("Primary AI provider: Gemini");
        console.log("--------------------------------");

        const result = await reviewWithGemini(
            content,
            brandRules,
            ruleResults
        );

        console.log("Gemini analysis successful.");

        return result;

    } catch (geminiError) {

        console.error(
            "Gemini failed:",
            geminiError.status || "",
            geminiError.message
        );

        console.log("Switching to OpenAI backup...");
    }

    // Second provider: OpenAI
    try {

        console.log("--------------------------------");
        console.log("Backup AI provider: OpenAI");
        console.log("--------------------------------");

        const result = await reviewWithOpenAI(
            content,
            brandRules,
            ruleResults
        );

        console.log("OpenAI analysis successful.");

        return result;

    } catch (openaiError) {

        console.error(
            "OpenAI failed:",
            openaiError.status || "",
            openaiError.message
        );
    }

    // Both providers unavailable
    return {

        available: false,

        provider: null,

        summary: "Both AI providers are currently unavailable.",

        error: "Gemini and OpenAI could not complete the analysis. Your rule-based findings are still available.",

        recommendations: []
    };
}

module.exports = reviewWithAI;