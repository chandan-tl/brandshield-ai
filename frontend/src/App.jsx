import { useState } from "react";
import { reviewContent, reviewAI } from "./services/api";
import "./App.css";

const APPROVAL_STORAGE_KEY = "brandshield_approval_records";

function App() {
    const [brandName, setBrandName] = useState("My Brand");
    const [brandTone, setBrandTone] = useState("Professional");
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

    function getBrandRules() {
        return {
            brandName: brandName.trim() || "Unnamed brand",
            brandTone,
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
            const initialResults = {
                originalContent: submittedContent,
                brandRules: rules,
                ruleResults: ruleData.ruleResults,
                aiResults: null,
            };

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

                setResults((current) => {
                    if (!current || current.originalContent !== submittedContent) {
                        return current;
                    }
                    return { ...current, aiResults: aiData.aiResults };
                });
            } catch (aiError) {
                setResults((current) => {
                    if (!current || current.originalContent !== submittedContent) {
                        return current;
                    }
                    return {
                        ...current,
                        aiResults: {
                            available: false,
                            summary: "AI analysis could not be completed. Rule-based results are still available.",
                            error: aiError.message,
                            recommendations: [],
                        },
                    };
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

            setResults((current) => current
                ? { ...current, aiResults: aiData.aiResults }
                : current
            );
        } catch (retryError) {
            setResults((current) => current
                ? {
                    ...current,
                    aiResults: {
                        available: false,
                        summary: "AI analysis could not be completed.",
                        error: retryError.message,
                        recommendations: [],
                    },
                }
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
                                            <p>Gemini is analysing tone, context and marketing claims.</p>
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

                <footer className="footer">
                    BrandShield AI © 2026 | Every piece of content. One trusted brand.
                </footer>
            </main>
        </div>
    );
}

export default App;
