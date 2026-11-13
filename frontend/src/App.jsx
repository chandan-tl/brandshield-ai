import { useState } from "react";
import { reviewContent, reviewAI } from "./services/api";
import "./App.css";

const APPROVAL_STORAGE_KEY = "brandshield_approval_records";
const REVIEW_HISTORY_KEY = "brandshield_review_history_v1";
const MAX_REVIEW_HISTORY = 30;

function readReviewHistory() {
    try {
        const saved = JSON.parse(localStorage.getItem(REVIEW_HISTORY_KEY) || "[]");
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        console.warn("Could not read review history:", error);
        return [];
    }
}

function createReviewId() {
    return globalThis.crypto?.randomUUID?.() || `review-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function App() {
    const [brandName, setBrandName] = useState("My Brand");
    const [brandTone, setBrandTone] = useState("Professional");
    const [targetAudience, setTargetAudience] = useState("General consumers");
    const [contentType, setContentType] = useState("Social media post");
    const [restrictedWords, setRestrictedWords] = useState("cheap, guaranteed, fake");
    const [preferredTerms, setPreferredTerms] = useState("cheap:affordable, buy:discover");
    const [approvedFacts, setApprovedFacts] = useState("Founded in 2020");

    const [content, setContent] = useState("");
    const [results, setResults] = useState(null);
    const [reviewedRules, setReviewedRules] = useState(null);
    const [loading, setLoading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [error, setError] = useState("");

    const [approvalConfirmed, setApprovalConfirmed] = useState(false);
    const [approvalRecord, setApprovalRecord] = useState(null);
    const [reviewHistory, setReviewHistory] = useState(readReviewHistory);

    function getBrandRules() {
        return {
            brandName: brandName.trim() || "Unnamed brand",
            brandTone,
            targetAudience: targetAudience.trim() || "Not specified",
            contentType,
            restrictedWords: restrictedWords
                .split(",")
                .map((word) => word.trim())
                .filter(Boolean),
            preferredTerms: preferredTerms
                .split(",")
                .map((entry) => {
                    const separatorIndex = entry.indexOf(":");
                    if (separatorIndex === -1) return null;

                    const term = entry.slice(0, separatorIndex).trim();
                    const preferred = entry.slice(separatorIndex + 1).trim();
                    if (!term || !preferred) return null;

                    return { term, preferred };
                })
                .filter(Boolean),
            approvedFacts: approvedFacts
                .split("\n")
                .map((fact) => fact.trim())
                .filter(Boolean),
        };
    }

    function invalidateReview() {
        setResults(null);
        setReviewedRules(null);
        setApprovalConfirmed(false);
        setApprovalRecord(null);
        setError("");
    }

    function saveHistoryRecord(record) {
        const current = readReviewHistory();
        const next = [record, ...current.filter((item) => item.id !== record.id)]
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            .slice(0, MAX_REVIEW_HISTORY);

        try {
            localStorage.setItem(REVIEW_HISTORY_KEY, JSON.stringify(next));
            setReviewHistory(next);
            return true;
        } catch (storageError) {
            console.error("Could not save review history:", storageError);
            setError("This review is available now, but browser storage could not save it to history.");
            return false;
        }
    }

    function updateHistoryRecord(id, changes) {
        if (!id) return;
        const current = readReviewHistory();
        const next = current.map((item) =>
            item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item
        );
        try {
            localStorage.setItem(REVIEW_HISTORY_KEY, JSON.stringify(next));
            setReviewHistory(next);
        } catch (storageError) {
            console.error("Could not update review history:", storageError);
            setError("The review changed, but browser storage could not update its history record.");
        }
    }

    function handleViewHistory(record) {
        if (!record) return;
        const savedRules = record.brandRules || {};
        setBrandName(savedRules.brandName || "My Brand");
        setBrandTone(savedRules.brandTone || "Professional");
        setTargetAudience(savedRules.targetAudience || "Not specified");
        setContentType(savedRules.contentType || "Social media post");
        setRestrictedWords(Array.isArray(savedRules.restrictedWords)
            ? savedRules.restrictedWords.join(", ")
            : "");
        setPreferredTerms(Array.isArray(savedRules.preferredTerms)
            ? savedRules.preferredTerms.map((item) => `${item.term || ""}:${item.preferred || ""}`).join(", ")
            : "");
        setApprovedFacts(Array.isArray(savedRules.approvedFacts)
            ? savedRules.approvedFacts.join("\n")
            : "");
        setContent(record.originalContent || "");
        setResults({
            historyId: record.id,
            originalContent: record.originalContent || "",
            brandRules: savedRules,
            ruleResults: record.ruleResults || { status: "Reviewed", totalIssues: 0, issues: [] },
            aiResults: record.aiResults || null,
        });
        setReviewedRules(savedRules);
        setApprovalConfirmed(false);
        setApprovalRecord(record.approvalStatus === "Approved"
            ? {
                brandName: record.brandName || record.brandRules?.brandName || brandName,
                approvedAt: record.approvedAt,
                savedLocally: true,
                historical: true,
            }
            : null);
        setError("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function handleDeleteHistory(id) {
        const next = readReviewHistory().filter((item) => item.id !== id);
        try {
            localStorage.setItem(REVIEW_HISTORY_KEY, JSON.stringify(next));
            setReviewHistory(next);
            if (results?.historyId === id) setApprovalRecord(null);
        } catch (storageError) {
            console.error("Could not delete review history:", storageError);
            setError("Could not delete this history record from browser storage.");
        }
    }

    function handleRevokeHistoryApproval(record) {
        if (!record?.id) return;
        updateHistoryRecord(record.id, {
            approvalStatus: "Pending Review",
            approvedAt: null,
            approvalAcknowledgement: null,
        });
        if (results?.historyId === record.id) {
            setApprovalRecord(null);
            setApprovalConfirmed(false);
        }
    }

    async function runReview(contentToReview, rules = getBrandRules()) {
        const submittedContent = contentToReview.trim();

        if (!submittedContent) {
            setError("Please enter content to analyse.");
            return;
        }

        setLoading(true);
        setAiLoading(false);
        setError("");
        setResults(null);
        setApprovalConfirmed(false);
        setApprovalRecord(null);
        setReviewedRules(rules);

        try {
            // First return fast deterministic findings to the dashboard.
            const ruleData = await reviewContent(submittedContent, rules);
            const historyId = createReviewId();
            const initialResults = {
                historyId,
                originalContent: submittedContent,
                brandRules: rules,
                ruleResults: ruleData.ruleResults,
                aiResults: null,
            };

            saveHistoryRecord({
                id: historyId,
                brandName: rules.brandName || "Unnamed brand",
                originalContent: submittedContent,
                brandRules: rules,
                ruleResults: ruleData.ruleResults,
                aiResults: null,
                approvalStatus: "Pending Review",
                createdAt: new Date().toISOString(),
                approvedAt: null,
            });

            setResults(initialResults);
            setLoading(false);

            // Then run AI separately. If it fails, rule results remain visible.
            setAiLoading(true);
            try {
                const aiData = await reviewAI(
                    submittedContent,
                    rules,
                    ruleData.ruleResults
                );

                updateHistoryRecord(historyId, { aiResults: aiData.aiResults });
                setResults((current) => {
                    if (!current || current.historyId !== historyId) {
                        return current;
                    }
                    return { ...current, aiResults: aiData.aiResults };
                });
            } catch (aiError) {
                const unavailableResult = {
                    available: false,
                    summary: "AI analysis could not be completed. Rule-based results are still available.",
                    error: aiError.message,
                    recommendations: [],
                    claimVerification: [],
                };
                updateHistoryRecord(historyId, { aiResults: unavailableResult });
                setResults((current) => {
                    if (!current || current.historyId !== historyId) {
                        return current;
                    }
                    return { ...current, aiResults: unavailableResult };
                });
            } finally {
                setAiLoading(false);
            }
        } catch (reviewError) {
            setError(reviewError.message || "Content review failed.");
        } finally {
            setLoading(false);
        }
    }

    function handleReview() {
        return runReview(content, getBrandRules());
    }

    async function handleRetryAI() {
        if (!results || !reviewedRules || aiLoading) return;

        setAiLoading(true);
        setApprovalConfirmed(false);
        setApprovalRecord(null);
        setError("");

        try {
            const aiData = await reviewAI(
                results.originalContent,
                reviewedRules,
                results.ruleResults
            );

            updateHistoryRecord(results.historyId, { aiResults: aiData.aiResults });
            setResults((current) => current
                ? { ...current, aiResults: aiData.aiResults }
                : current
            );
        } catch (retryError) {
            const unavailableResult = {
                available: false,
                summary: "AI analysis could not be completed.",
                error: retryError.message,
                recommendations: [],
                claimVerification: [],
            };
            updateHistoryRecord(results.historyId, { aiResults: unavailableResult });
            setResults((current) => current
                ? { ...current, aiResults: unavailableResult }
                : current
            );
        } finally {
            setAiLoading(false);
        }
    }

    async function handleApplySuggestion() {
        const suggestion = results?.aiResults?.rewriteSuggestion?.trim();
        if (!suggestion) return;

        setContent(suggestion);
        await runReview(suggestion, reviewedRules || getBrandRules());
    }

    function handleApprove() {
        if (!results || aiLoading || loading || !approvalConfirmed) return;
        if (content.trim() !== results.originalContent) {
            setError("The content has changed. Run the review again before approval.");
            return;
        }

        const record = {
            id: globalThis.crypto?.randomUUID?.() || `approval-${Date.now()}`,
            brandName: reviewedRules?.brandName || brandName,
            approvedContent: results.originalContent,
            approvedAt: new Date().toISOString(),
            ruleIssueCount: results.ruleResults?.totalIssues || 0,
            aiStatus: results.aiResults?.available ? "completed" : "unavailable",
            aiModel: results.aiResults?.model || null,
            acknowledgement: "Human reviewer confirmed that the findings were reviewed.",
        };

        try {
            const existing = JSON.parse(
                localStorage.getItem(APPROVAL_STORAGE_KEY) || "[]"
            );
            const records = Array.isArray(existing) ? existing : [];
            localStorage.setItem(
                APPROVAL_STORAGE_KEY,
                JSON.stringify([record, ...records].slice(0, 25))
            );
            if (results.historyId) {
                updateHistoryRecord(results.historyId, {
                    approvalStatus: "Approved",
                    approvedAt: record.approvedAt,
                    approvalAcknowledgement: record.acknowledgement,
                });
            }
            setApprovalRecord({ ...record, savedLocally: true });
        } catch (storageError) {
            console.error("Could not save the approval record:", storageError);
            setApprovalRecord({ ...record, savedLocally: false });
            setError("Approval was recorded for this session, but browser storage was unavailable.");
        }
    }

    function handleReset() {
        setContent("");
        setResults(null);
        setReviewedRules(null);
        setError("");
        setApprovalConfirmed(false);
        setApprovalRecord(null);
    }

    const canApprove = Boolean(
        results &&
        results.aiResults !== null &&
        !loading &&
        !aiLoading &&
        approvalConfirmed &&
        content.trim() === results.originalContent
    );

    return (
        <div className="app">
            <aside className="sidebar">
                <div className="logo">
                    <div className="logo-icon">B</div>
                    <div>
                        <h2>BrandShield</h2>
                        <span>AI CONTENT GUARD</span>
                    </div>
                </div>

                <nav className="navigation" aria-label="Workspace navigation">
                    <p className="nav-heading">WORKSPACE</p>
                    <div className="nav-item active">▦ Dashboard</div>
                    <div className="nav-item">◈ Brand Guidelines</div>
                    <div className="nav-item">◉ Content Review</div>
                </nav>

                <div className="sidebar-bottom">
                    <span className="status-dot" />
                    Brand protection active
                </div>
            </aside>

            <main className="main-content">
                <header className="topbar">
                    <div>
                        <p className="breadcrumb">Workspace / Dashboard</p>
                        <h1>Brand Compliance Dashboard</h1>
                    </div>
                    <span className="system-status">● System Online</span>
                </header>

                <section className="welcome-section">
                    <p className="eyebrow">BRAND PROTECTION WORKSPACE</p>
                    <h2>Every piece of content. One trusted brand.</h2>
                    <p>Analyse your content against your brand guidelines before publishing.</p>
                </section>

                <div className="dashboard-grid">
                    <section className="card">
                        <div className="card-heading">
                            <div>
                                <span className="section-label">CONFIGURATION</span>
                                <h3>Brand Guidelines</h3>
                            </div>
                            <span className="card-icon">◈</span>
                        </div>

                        <div className="form-group">
                            <label htmlFor="brand-name">Brand Name</label>
                            <input
                                id="brand-name"
                                value={brandName}
                                disabled={loading || aiLoading}
                                onChange={(event) => {
                                    setBrandName(event.target.value);
                                    invalidateReview();
                                }}
                                placeholder="Enter brand name"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="brand-tone">Brand Tone</label>
                            <select
                                id="brand-tone"
                                value={brandTone}
                                disabled={loading || aiLoading}
                                onChange={(event) => {
                                    setBrandTone(event.target.value);
                                    invalidateReview();
                                }}
                            >
                                <option>Professional</option>
                                <option>Friendly</option>
                                <option>Luxury</option>
                                <option>Casual</option>
                                <option>Innovative</option>
                                <option>Playful</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="target-audience">Target Audience</label>
                            <input
                                id="target-audience"
                                value={targetAudience}
                                maxLength={180}
                                disabled={loading || aiLoading}
                                onChange={(event) => {
                                    setTargetAudience(event.target.value);
                                    invalidateReview();
                                }}
                                placeholder="e.g. young professionals, parents, first-time buyers"
                            />
                            <small>Describe who this content is intended to reach.</small>
                        </div>

                        <div className="form-group">
                            <label htmlFor="content-type">Content Type</label>
                            <select
                                id="content-type"
                                value={contentType}
                                disabled={loading || aiLoading}
                                onChange={(event) => {
                                    setContentType(event.target.value);
                                    invalidateReview();
                                }}
                            >
                                <option>Social media post</option>
                                <option>Advertisement</option>
                                <option>Website copy</option>
                                <option>Product description</option>
                                <option>Email campaign</option>
                                <option>Blog article</option>
                                <option>Press release</option>
                                <option>Landing page</option>
                            </select>
                            <small>Choose the format Gemini should consider during the review.</small>
                        </div>

                        <div className="form-group">
                            <label htmlFor="restricted-words">Restricted Words</label>
                            <input
                                id="restricted-words"
                                value={restrictedWords}
                                disabled={loading || aiLoading}
                                onChange={(event) => {
                                    setRestrictedWords(event.target.value);
                                    invalidateReview();
                                }}
                                placeholder="cheap, guaranteed, fake"
                            />
                            <small>Separate words or phrases with commas.</small>
                        </div>

                        <div className="form-group">
                            <label htmlFor="preferred-terms">Preferred Terminology</label>
                            <textarea
                                id="preferred-terms"
                                rows="3"
                                value={preferredTerms}
                                disabled={loading || aiLoading}
                                onChange={(event) => {
                                    setPreferredTerms(event.target.value);
                                    invalidateReview();
                                }}
                                placeholder="cheap:affordable, buy:discover"
                            />
                            <small>Format: original:preferred, original:preferred</small>
                        </div>

                        <div className="form-group">
                            <label htmlFor="approved-facts">Approved Brand Facts</label>
                            <textarea
                                id="approved-facts"
                                rows="4"
                                value={approvedFacts}
                                disabled={loading || aiLoading}
                                onChange={(event) => {
                                    setApprovedFacts(event.target.value);
                                    invalidateReview();
                                }}
                                placeholder="Enter approved facts, one per line"
                            />
                            <small>These are supplied references, not independently verified evidence.</small>
                        </div>
                    </section>

                    <section className="card">
                        <div className="card-heading">
                            <div>
                                <span className="section-label">CONTENT ANALYSIS</span>
                                <h3>Review Your Content</h3>
                            </div>
                            <span className="card-icon">✎</span>
                        </div>

                        <div className="form-group">
                            <label htmlFor="content-input">Content to Analyse</label>
                            <textarea
                                id="content-input"
                                className="content-input"
                                rows="12"
                                value={content}
                                disabled={loading || aiLoading}
                                onChange={(event) => {
                                    setContent(event.target.value);
                                    invalidateReview();
                                }}
                                placeholder="Paste your marketing content, social media caption, advertisement or website copy here..."
                            />
                            <div className="character-count">{content.length} characters</div>
                        </div>

                        <div className="review-actions">
                            <button
                                className="primary-button"
                                onClick={handleReview}
                                disabled={loading || aiLoading || !content.trim()}
                            >
                                {loading
                                    ? "Checking Brand Rules..."
                                    : aiLoading
                                        ? "Running Gemini AI..."
                                        : "✦ Analyse Content"}
                            </button>
                            <button
                                className="secondary-button"
                                onClick={handleReset}
                                disabled={loading || aiLoading}
                            >
                                Reset
                            </button>
                        </div>

                        {error && <div className="error-message" role="alert">{error}</div>}

                        {results && (
                            <div className="results-section">
                                <div className="results-heading">
                                    <h3>Analysis Results</h3>
                                    <span className={
                                        results.ruleResults?.status === "Passed"
                                            ? "result-status passed"
                                            : "result-status warning"
                                    }>
                                        {results.ruleResults?.status || "Reviewed"}
                                    </span>
                                </div>

                                <div className="result-summary">
                                    <strong>{results.ruleResults?.totalIssues ?? 0}</strong>
                                    <span>Deterministic issues detected</span>
                                </div>

                                {results.ruleResults?.issues?.length ? (
                                    <div className="issues-list">
                                        {results.ruleResults.issues.map((issue, index) => (
                                            <article className="issue-card" key={`${issue.term || issue.type}-${index}`}>
                                                <div className="issue-top">
                                                    <strong>{issue.type}</strong>
                                                    <span className={`severity ${(issue.severity || "low").toLowerCase()}`}>
                                                        {issue.severity}
                                                    </span>
                                                </div>
                                                <p>{issue.message}</p>
                                                <div className="suggestion">
                                                    <strong>Suggestion: </strong>{issue.suggestion}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="success-message">No deterministic rule violations detected.</p>
                                )}

                                <section className="ai-results">
                                    <div className="ai-results-header">
                                        <h4>✦ Gemini AI Intelligence</h4>
                                        <span className={
                                            aiLoading
                                                ? "ai-processing"
                                                : results.aiResults?.available
                                                    ? "ai-connected"
                                                    : results.aiResults
                                                        ? "ai-disconnected"
                                                        : "ai-processing"
                                        }>
                                            {aiLoading
                                                ? "Analysing..."
                                                : results.aiResults?.available
                                                    ? `AI Connected${results.aiResults.model ? ` · ${results.aiResults.model}` : ""}`
                                                    : results.aiResults
                                                        ? "AI Unavailable"
                                                        : "Waiting"}
                                        </span>
                                    </div>

                                    {aiLoading && (
                                        <div className="ai-loading" role="status">
                                            <div className="ai-spinner" />
                                            <p>Your rule checks are complete.</p>
                                            <p>Gemini is analysing brand tone, target audience, content type and marketing claims.</p>
                                            <small>Your rule-based results are already available above.</small>
                                        </div>
                                    )}

                                    {!aiLoading && results.aiResults?.available && (
                                        <>
                                            <p className="ai-summary">{results.aiResults.summary}</p>

                                            <div className="ai-score-card">
                                                <div>
                                                    <strong>{results.aiResults.complianceScore}/100</strong>
                                                    <span>AI Compliance Score</span>
                                                </div>
                                                <div>
                                                    <strong>{results.aiResults.riskLevel}</strong>
                                                    <span>Risk Level</span>
                                                </div>
                                                <div>
                                                    <strong>{results.aiResults.toneMatch}</strong>
                                                    <span>Tone Match</span>
                                                </div>
                                            </div>

                                            <div className="ai-block">
                                                <h5>Brand Tone Analysis</h5>
                                                <p>{results.aiResults.brandToneAnalysis}</p>
                                            </div>

                                            <div className="ai-block">
                                                <h5>Target Audience Fit</h5>
                                                <p>{results.aiResults.audienceFitAnalysis || "No audience-fit analysis was returned."}</p>
                                                <small className="helper-text">
                                                    Audience: {results.brandRules?.targetAudience || "Not specified"}
                                                </small>
                                            </div>

                                            <div className="ai-block">
                                                <h5>Content-Type Fit</h5>
                                                <p>{results.aiResults.contentTypeAnalysis || "No content-type analysis was returned."}</p>
                                                <small className="helper-text">
                                                    Content type: {results.brandRules?.contentType || "Not specified"}
                                                </small>
                                            </div>

                                            <div className="ai-block">
                                                <h5>AI Findings</h5>
                                                {results.aiResults.findings?.length ? (
                                                    results.aiResults.findings.map((finding, index) => (
                                                        <article className="ai-finding" key={`ai-finding-${index}`}>
                                                            <div className="issue-top">
                                                                <strong>{finding.category}</strong>
                                                                <span className={`severity ${(finding.severity || "low").toLowerCase()}`}>
                                                                    {finding.severity}
                                                                </span>
                                                            </div>
                                                            {finding.quotedText && <p><strong>Content:</strong> {finding.quotedText}</p>}
                                                            <p>{finding.explanation}</p>
                                                            <div className="suggestion">
                                                                <strong>Recommendation: </strong>{finding.recommendation}
                                                            </div>
                                                        </article>
                                                    ))
                                                ) : (
                                                    <p>No additional contextual issues identified.</p>
                                                )}
                                            </div>

                                            <div className="ai-block">
                                                <h5>Claim Verification Against Approved Facts</h5>
                                                <p className="helper-text">
                                                    Claims are compared only with the facts you supplied. This is not an independent fact-check.
                                                </p>
                                                {results.aiResults.claimVerification?.length ? (
                                                    <div className="claim-verification-list">
                                                        {results.aiResults.claimVerification.map((claim, index) => {
                                                            const status = ["Supported", "Unsupported", "Requires Verification"].includes(claim.status)
                                                                ? claim.status
                                                                : "Requires Verification";
                                                            const badgeStyle = status === "Supported"
                                                                ? { background: "#e8f7ee", color: "#176b3a", border: "1px solid #b9e4c8" }
                                                                : status === "Unsupported"
                                                                    ? { background: "#fdecec", color: "#a12626", border: "1px solid #f3c1c1" }
                                                                    : { background: "#fff6df", color: "#805b00", border: "1px solid #f0dfa8" };
                                                            return (
                                                                <article className="ai-finding" key={`claim-verification-${index}`}>
                                                                    <div className="issue-top">
                                                                        <strong>{claim.claim}</strong>
                                                                        <span style={{ ...badgeStyle, display: "inline-block", padding: "4px 9px", borderRadius: "999px", fontSize: "12px", fontWeight: 700 }}>
                                                                            {status}
                                                                        </span>
                                                                    </div>
                                                                    {claim.supportingFact && <p><strong>Matching fact:</strong> {claim.supportingFact}</p>}
                                                                    <p>{claim.explanation}</p>
                                                                </article>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <p>
                                                        {results.brandRules?.approvedFacts?.length
                                                            ? "No material factual claims were classified in this review."
                                                            : "Add approved brand facts to enable claim comparison."}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="ai-block">
                                                <h5>Claims Requiring Verification</h5>
                                                {results.aiResults.claimsToVerify?.length ? (
                                                    <ul>
                                                        {results.aiResults.claimsToVerify.map((claim, index) => (
                                                            <li key={`claim-${index}`}>{claim}</li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p>No claims were flagged for verification.</p>
                                                )}
                                            </div>

                                            <div className="ai-block">
                                                <h5>AI Suggested Improvement</h5>
                                                <p className="rewrite-text">{results.aiResults.rewriteSuggestion}</p>
                                                <button
                                                    className="primary-button apply-button"
                                                    onClick={handleApplySuggestion}
                                                    disabled={!results.aiResults.rewriteSuggestion}
                                                >
                                                    ✦ Apply Suggestion & Recheck
                                                </button>
                                                <small className="helper-text">
                                                    Replaces the current text and runs both checks again.
                                                </small>
                                            </div>

                                            <div className="ai-block">
                                                <h5>Additional Recommendations</h5>
                                                {results.aiResults.recommendations?.length ? (
                                                    <ul>
                                                        {results.aiResults.recommendations.map((item, index) => (
                                                            <li key={`recommendation-${index}`}>{item}</li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p>No additional recommendations.</p>
                                                )}
                                            </div>
                                        </>
                                    )}

                                    {!aiLoading && results.aiResults && !results.aiResults.available && (
                                        <div className="error-message">
                                            <p>{results.aiResults.summary}</p>
                                            <small>{results.aiResults.error}</small>
                                            <button
                                                className="retry-ai-button"
                                                onClick={handleRetryAI}
                                                disabled={aiLoading}
                                            >
                                                ↻ Retry AI Analysis
                                            </button>
                                            <small className="helper-text">Your rule-based findings remain available.</small>
                                        </div>
                                    )}
                                </section>

                                {/* Human approval is deliberately separate from AI scoring. */}
                                <section className="approval-panel">
                                    <h4>Human Review & Approval</h4>

                                    {approvalRecord ? (
                                        <div className="approval-success">
                                            <strong>✓ Content Approved</strong>
                                            <p>Approved for {approvalRecord.brandName}.</p>
                                            <small>{new Date(approvalRecord.approvedAt).toLocaleString()}</small>
                                            <small>
                                                {approvalRecord.savedLocally
                                                    ? "Approval record saved in this browser."
                                                    : "Approval shown for this session; browser storage was unavailable."}
                                            </small>
                                        </div>
                                    ) : (
                                        <>
                                            <p>
                                                Review the original content, deterministic findings and AI assessment before approving.
                                                AI scores and suggestions are advisory, not proof of factual accuracy.
                                            </p>

                                            {!results.aiResults?.available && (
                                                <p className="approval-warning">
                                                    AI analysis is unavailable. You may still approve after reviewing the rule-based findings and acknowledging this limitation.
                                                </p>
                                            )}

                                            <label className="approval-checkbox">
                                                <input
                                                    type="checkbox"
                                                    checked={approvalConfirmed}
                                                    onChange={(event) => setApprovalConfirmed(event.target.checked)}
                                                    disabled={loading || aiLoading}
                                                />
                                                <span>
                                                    I have reviewed the findings and accept responsibility for the final publication decision, including any unresolved items.
                                                </span>
                                            </label>

                                            <button
                                                className="approve-button"
                                                onClick={handleApprove}
                                                disabled={!canApprove}
                                            >
                                                ✓ Approve Current Content
                                            </button>
                                        </>
                                    )}

                                    <small className="helper-text">
                                        Demo limitation: approval records are stored in this browser's local storage, not in a shared database or organisation-wide audit log.
                                    </small>
                                </section>
                            </div>
                        )}
                    </section>
                </div>

                <section className="card history-card" id="review-history" aria-labelledby="history-heading">
                    <div className="card-heading">
                        <div>
                            <span className="section-label">REVIEW MANAGEMENT</span>
                            <h3 id="history-heading">Review History & Approval Status</h3>
                        </div>
                        <span className="card-icon">◷</span>
                    </div>
                    <p className="helper-text">
                        Reviews are saved in this browser only. They are not shared across devices or team members.
                    </p>
                    {reviewHistory.length ? (
                        <div className="history-list" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {reviewHistory.map((record) => (
                                <article className="history-item" key={record.id} style={{ border: "1px solid #e4e7ec", borderRadius: "10px", padding: "14px" }}>
                                    <div className="history-item-main">
                                        <div className="issue-top">
                                            <strong>{record.brandName || "Unnamed brand"}</strong>
                                            <span className={record.approvalStatus === "Approved" ? "severity low" : "severity medium"}>
                                                {record.approvalStatus || "Pending Review"}
                                            </span>
                                        </div>
                                        <p className="history-preview">
                                            {(record.originalContent || "").replace(/\s+/g, " ").slice(0, 180)}
                                            {(record.originalContent || "").length > 180 ? "…" : ""}
                                        </p>
                                        <small className="helper-text">
                                            {record.createdAt ? new Date(record.createdAt).toLocaleString() : "Date unavailable"}
                                            {` · ${record.ruleResults?.totalIssues ?? 0} rule issue(s)`}
                                            {record.aiResults?.available && Number.isFinite(Number(record.aiResults.complianceScore))
                                                ? ` · AI score ${record.aiResults.complianceScore}/100`
                                                : " · AI result unavailable"}
                                        </small>
                                    </div>
                                    <div className="history-actions" style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                                        <button className="secondary-button" type="button" onClick={() => handleViewHistory(record)}>
                                            View Review
                                        </button>
                                        {record.approvalStatus === "Approved" && (
                                            <button className="secondary-button" type="button" onClick={() => handleRevokeHistoryApproval(record)}>
                                                Reopen Approval
                                            </button>
                                        )}
                                        <button className="secondary-button" type="button" onClick={() => handleDeleteHistory(record.id)}>
                                            Delete
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <p className="success-message">No saved reviews yet. Complete a content analysis to create the first history record.</p>
                    )}
                </section>

                <footer className="footer">
                    BrandShield AI © 2026 | Every piece of content. One trusted brand.
                </footer>
            </main>
        </div>
    );
}

export default App;
