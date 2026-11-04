function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Case-insensitive whole-word or whole-phrase matching. Unicode letters are supported.
function containsTerm(content, term) {
    const escaped = escapeRegex(term.trim());
    const pattern = `(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`;
    return new RegExp(pattern, "iu").test(content);
}

function analyzeContent(content, brandRules = {}) {
    const issues = [];

    const restrictedWords = Array.isArray(brandRules.restrictedWords)
        ? brandRules.restrictedWords
        : [];
    const preferredTerms = Array.isArray(brandRules.preferredTerms)
        ? brandRules.preferredTerms
        : [];
    const approvedFacts = Array.isArray(brandRules.approvedFacts)
        ? brandRules.approvedFacts
        : [];

    // Merge rules by source term so a restricted + preferred word is reported once.
    const ruleMap = new Map();

    for (const value of restrictedWords) {
        if (typeof value !== "string" || !value.trim()) continue;

        const term = value.trim();
        const key = term.toLocaleLowerCase();

        if (!ruleMap.has(key)) {
            ruleMap.set(key, {
                term,
                restricted: false,
                preferred: null,
            });
        }

        ruleMap.get(key).restricted = true;
    }

    for (const item of preferredTerms) {
        if (!item || typeof item.term !== "string" || typeof item.preferred !== "string") {
            continue;
        }

        const term = item.term.trim();
        const preferred = item.preferred.trim();
        if (!term || !preferred) continue;

        const key = term.toLocaleLowerCase();

        if (!ruleMap.has(key)) {
            ruleMap.set(key, {
                term,
                restricted: false,
                preferred: null,
            });
        }

        ruleMap.get(key).preferred = preferred;
    }

    for (const rule of ruleMap.values()) {
        if (!containsTerm(content, rule.term)) continue;

        if (rule.restricted && rule.preferred) {
            issues.push({
                type: "Restricted Term & Preferred Terminology",
                severity: "High",
                term: rule.term,
                message: `"${rule.term}" is restricted and should be replaced with "${rule.preferred}".`,
                suggestion: `Replace "${rule.term}" with "${rule.preferred}".`,
            });
        } else if (rule.restricted) {
            issues.push({
                type: "Restricted Term",
                severity: "High",
                term: rule.term,
                message: `The term "${rule.term}" is restricted by your brand guidelines.`,
                suggestion: `Remove or replace "${rule.term}".`,
            });
        } else if (rule.preferred) {
            issues.push({
                type: "Preferred Terminology",
                severity: "Medium",
                term: rule.term,
                message: `"${rule.term}" should be replaced with "${rule.preferred}".`,
                suggestion: `Use "${rule.preferred}" instead.`,
            });
        }
    }

    const severityCounts = issues.reduce(
        (counts, issue) => {
            const key = issue.severity.toLowerCase();
            counts[key] += 1;
            return counts;
        },
        { high: 0, medium: 0, low: 0 }
    );

    const status = severityCounts.high > 0
        ? "Needs Attention"
        : issues.length > 0
            ? "Review Required"
            : "Passed";

    return {
        totalIssues: issues.length,
        severityCounts,
        approvedFactsProvided: approvedFacts.some(
            (fact) => typeof fact === "string" && fact.trim()
        ),
        status,
        issues,
    };
}

module.exports = analyzeContent;
