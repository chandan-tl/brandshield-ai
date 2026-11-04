async function reviewWithOpenAI(content, brandRules, ruleResults) {

    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OpenAI API key is missing.");
    }

    // Load OpenAI SDK
    const OpenAI = (await import("openai")).default;

    const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 15000,
        maxRetries: 0
    });

    const model =
        process.env.OPENAI_MODEL || "gpt-5.4-mini";

    const schema = {

        type: "object",
        additionalProperties: false,

        properties: {

            summary: {
                type: "string"
            },

            brandToneAnalysis: {
                type: "string"
            },

            toneMatch: {
                type: "string",
                enum: ["Good", "Needs Improvement", "Poor"]
            },

            complianceScore: {
                type: "number"
            },

            riskLevel: {
                type: "string",
                enum: ["Low", "Medium", "High"]
            },

            findings: {
                type: "array",

                items: {
                    type: "object",
                    additionalProperties: false,

                    properties: {
                        category: { type: "string" },

                        severity: {
                            type: "string",
                            enum: ["Low", "Medium", "High"]
                        },

                        quotedText: { type: "string" },
                        explanation: { type: "string" },
                        recommendation: { type: "string" }
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
                type: "array",
                items: {
                    type: "string"
                }
            },

            rewriteSuggestion: {
                type: "string"
            },

            recommendations: {
                type: "array",
                items: {
                    type: "string"
                }
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
    };

    const prompt = `
You are BrandShield AI, an expert brand compliance analyst.

BRAND GUIDELINES:
${JSON.stringify(brandRules, null, 2)}

SUBMITTED CONTENT:
${content}

EXISTING RULE-BASED FINDINGS:
${JSON.stringify(ruleResults?.issues || [], null, 2)}

ANALYSE:

1. Brand tone consistency.
2. Contextual brand guideline compliance.
3. Potentially misleading marketing claims.
4. Claims requiring factual evidence.
5. Brand reputation risks.
6. Content improvement opportunities.

IMPORTANT:

- Do not invent brand guidelines.
- Do not declare unsupported claims false.
- Avoid duplicating the existing rule-based findings.
- Treat approved facts as supplied references, not verified evidence.
- Generate professional, practical recommendations.
- Provide a corrected version of the submitted content.

Return only the requested structured JSON.
`;

    const response = await client.responses.create({

        model,

        input: [
            {
                role: "user",
                content: prompt
            }
        ],

        max_output_tokens: 1200,

        text: {
            format: {
                type: "json_schema",
                name: "brand_compliance_analysis",
                strict: true,
                schema
            }
        }
    });

    if (!response.output_text) {
        throw new Error("OpenAI returned an empty response.");
    }

    const result = JSON.parse(response.output_text);

    console.log("OpenAI analysis completed.");

    return {
        available: true,
        provider: "OpenAI",
        model,
        ...result
    };
}

module.exports = reviewWithOpenAI;