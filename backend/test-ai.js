require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

async function testGemini() {
    console.log("\n========== GEMINI TEST ==========");

    try {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("Gemini API key missing");
        }

        const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: {
                timeout: 15000,
                retryOptions: {
                    attempts: 1
                }
            }
        });

        const model =
            process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

        const response = await ai.models.generateContent({
            model,
            contents: "Reply with exactly: GEMINI_OK"
        });

        console.log("✅ GEMINI WORKING");
        console.log("Model:", model);
        console.log("Response:", response.text);

    } catch (error) {
        console.log("❌ GEMINI FAILED");
        console.log("Status:", error.status || "Unknown");
        console.log("Code:", error.code || "Unknown");
        console.log("Message:", error.message);
    }
}

async function testOpenAI() {
    console.log("\n========== OPENAI TEST ==========");

    try {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OpenAI API key missing");
        }

        const OpenAI = (await import("openai")).default;

        const client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            timeout: 60000,
            maxRetries: 0
        });

        const model =
            process.env.OPENAI_MODEL || "gpt-6-luna";

        const response = await client.responses.create({
            model,
            input: "Reply with exactly: OPENAI_OK",
            max_output_tokens: 30
        });

        console.log("✅ OPENAI WORKING");
        console.log("Model:", model);
        console.log("Response:", response.output_text);

    } catch (error) {
        console.log("❌ OPENAI FAILED");
        console.log("Status:", error.status || "Unknown");
        console.log("Code:", error.code || "Unknown");
        console.log("Message:", error.message);
    }
}

async function runTests() {
    console.log("BRANDSHIELD AI - PROVIDER DIAGNOSTICS");

    await testGemini();
    await testOpenAI();

    console.log("\n========== TESTS COMPLETED ==========");
}

runTests();