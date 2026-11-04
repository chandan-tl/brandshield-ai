const API_BASE_URL = (
    import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/+$/, "");

async function postJson(endpoint, payload) {
    let response;

    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
    } catch (error) {
        throw new Error(
            "Cannot reach the BrandShield backend. Check that the backend server is running and VITE_API_URL is correct."
        );
    }

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error("The backend returned an invalid response.");
    }

    if (!response.ok || data.success === false) {
        throw new Error(data.message || `Request failed with status ${response.status}.`);
    }

    return data;
}

export function reviewContent(content, brandRules) {
    return postJson("/review", {
        content,
        brandRules,
    });
}

export function reviewAI(content, brandRules, ruleResults = null) {
    return postJson("/review/ai", {
        content,
        brandRules,
        ruleResults,
    });
}
