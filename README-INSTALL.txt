BRANDSHIELD AI - ROUND 2 MVP PATCH

This patch contains complete replacement files for the current React + Express project.

FILES TO REPLACE:
- backend/server.js
- backend/routes/reviewRoutes.js
- backend/controllers/reviewController.js
- backend/services/ruleEngine.js
- backend/services/aiReview.js
- backend/.gitignore
- frontend/src/services/api.js
- frontend/src/App.jsx
- frontend/src/App.css

SAFE SETUP:
1. Back up your existing project folder first.
2. Extract this ZIP into the existing brandshieldai project folder and allow the listed files to be replaced.
3. Do NOT replace or delete your real backend/.env file. The ZIP intentionally does not include it.
4. If you do not already have the Gemini SDK installed, run from backend:
      npm install @google/genai
5. Create/update backend/.env with:
      GEMINI_API_KEY=your_real_key
      GEMINI_MODEL=gemini-3.5-flash-lite
      GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite
      PORT=5000
6. Ensure backend/.gitignore contains .env and node_modules/.

START BACKEND (terminal 1):
    cd backend
    npm run dev

START FRONTEND (terminal 2):
    cd frontend
    npm run dev

Open the exact Local URL printed by Vite.

API ENDPOINTS:
- GET  /api/health
- POST /api/review       deterministic rule checks
- POST /api/review/ai    Gemini contextual analysis / retry

HUMAN APPROVAL LIMITATION:
The approval workflow requires a human acknowledgement and stores approval records in the current browser's localStorage. It is a functional MVP demonstration, not a shared server-side approval database or tamper-resistant audit log. A production release should use authenticated users, persistent database storage, and server-side audit history.

AI LIMITATION:
Gemini-generated scores and findings are advisory. Claims marked for verification require human evidence review; the system does not independently prove a claim true or false.
