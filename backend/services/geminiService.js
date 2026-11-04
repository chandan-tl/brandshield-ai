const { GoogleGenAI } = require("@google/genai");

async function reviewWithGemini(content, brandRules, ruleResults) {

    if (!process.env.GEMINI_API_KEY) {
        throw new Error("Gemini API key is missing.");
    }

    const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
    timeout: 60000,
    retryOptions: {
        attempts: 1
    }
}
    });

    const model =
        process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

    const prompt = `
You are BrandShield AI, an expert brand compliance analyst.

BRAND GUIDELINES:
${JSON.stringify(brandRules, null, 2)}

CONTENT:
${content}

RULE-BASED FINDINGS ALREADY DETECTED:
${JSON.stringify(ruleResults?.issues || [], null, 2)}

TASKS:

1. Analyse brand tone.
2. Identify contextual compliance problems.
3. Identify exaggerated marketing claims.
4. Identify claims requiring evidence.
5. Evaluate brand reputation risks.
6. Suggest improved content.

IMPORTANT:

- Do not invent brand guidelines.
- Do not declare unsupported claims false.
- Do not repeat existing rule-based findings unless there is an additional contextual insight.
- Treat approved facts as references, not independently verified evidence.
- Give practical recommendations.

Return structured JSON matching the required response schema.
`;

    const response = await ai.models.generateContent({

        model,

        contents: prompt,

        config: {
            responseMimeType: "application/json",
            maxOutputTokens: 900,

            responseSchema: {

                type: "OBJECT",

                properties: {

                    summary: {
                        type: "STRING"
                    },

                    brandToneAnalysis: {
                        type: "STRING"
                    },

                    toneMatch: {
                        type: "STRING",
                        enum: ["Good", "Needs Improvement", "Poor"]
                    },

                    complianceScore: {
                        type: "NUMBER"
                    },

                    riskLevel: {
                        type: "STRING",
                        enum: ["Low", "Medium", "High"]
                    },

                    findings: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                category: { type: "STRING" },
                                severity: {
                                    type: "STRING",
                                    enum: ["Low", "Medium", "High"]
                                },
                                quotedText: { type: "STRING" },
                                explanation: { type: "STRING" },
                                recommendation: { type: "STRING" }
                            },
                            required: [
                                "category",
                                "severity",
                                "quotedText",
                                "explanation",
                                "recommendation"
                            ]
                        }
                    },

                    claimsToVerify: {
                        type: "ARRAY",
                        items: { type: "STRING" }
                    },

                    rewriteSuggestion: {
                        type: "STRING"
                    },

                    recommendations: {
                        type: "ARRAY",
                        items: { type: "STRING" }
                    }
                },

                required: [
                    "summary",
                    "brandToneAnalysis",
                    "toneMatch",
                    "complianceScore",
                    "riskLevel",
                    "findings",
                    "claimsToVerify",
                    "rewriteSuggestion",
                    "recommendations"
                ]
            }
        }
    });

    if (!response.text) {
        throw new Error("Gemini returned an empty response.");
    }

    return {
        available: true,
        provider: "Google Gemini",
        model,
        ...JSON.parse(response.text)
    };
}

module.exports = reviewWithGemini;