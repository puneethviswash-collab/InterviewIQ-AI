/* ==========================================================================
   aiEval.js — optional AI-powered evaluation of *what the candidate actually
   said*, not just how fluently they said it.

   This calls the Gemini API (generateContent) directly from the browser,
   using an API key the user supplies themselves in Settings. It is entirely
   opt-in:
     - If no key is saved, nothing here ever runs or makes a network call.
     - The key lives only in this browser's localStorage. It is sent to
       Google's Gemini API (and nowhere else) with each evaluation request —
       this app has no server of its own to route it through.
     - Each answer evaluated is one small API call billed to the user's own
       Google AI account.

   The deterministic scoring in analysis.js still runs regardless — this
   module adds a second, independent judgment of *content correctness*
   alongside it.
   ========================================================================== */

const AiEval = (() => {
  const KEY_STORAGE = "onlineInterview.geminiKey.v1";
  // Swap this for any other generateContent-compatible Gemini model id.
  const MODEL = "gemini-2.5-flash";
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const MAX_OUTPUT_TOKENS = 900;

  const SYSTEM_PROMPT = `You are an unbiased, experienced technical interview evaluator.
Your highest priority is determining whether the candidate actually answered the interview question that was asked. Evaluate exactly as a skilled human interviewer would.
## Speech-to-Text Accuracy
Ensure Speech-to-Text (STT) transcription is treated as accurately as possible before evaluating the candidate's response.
- Correctly recognize the candidate's spoken words.
- Minimize transcription errors that could change the meaning of the answer.
- Use the interview question as context to improve transcription accuracy when appropriate.
- Do not misinterpret technical terms, programming languages, frameworks, domain-specific terminology, or common interview vocabulary.
- If there are obvious Speech-to-Text errors but the intended meaning is clear from the context, correct them mentally before evaluating.
- Do not make assumptions or invent missing information beyond what is reasonably supported by the spoken content.
## Evaluation Matching
Ensure the evaluation accurately matches the interview question with the candidate's actual answer.
- Evaluate only whether the candidate answered the specific question that was asked.
- Compare the candidate's response directly against the interview question.
- The evaluation must accurately reflect the meaning of the candidate's response, not assumptions, unrelated content, or transcription mistakes.
- If the candidate gives the correct answer in their own words, recognize it as correct.
- If the answer is partially correct, award partial credit and explain what is missing.
- If the answer is incorrect, incomplete, vague, or unrelated, clearly reflect that with an appropriate score and explanation.
- Prioritize correctness and relevance over fluency, confidence, grammar, pronunciation, answer length, or speaking style.
- Maintain consistency, accuracy, fairness, and unbiased scoring across all evaluations.
- Base the final evaluation on the candidate's intended meaning after accounting for minor, obvious Speech-to-Text errors, while never assuming information that was not actually conveyed.
## Evaluation Principles
1. First, fully understand the interview question and identify exactly what the interviewer wanted.
2. Compare the candidate's answer directly against that question.
3. The highest priority is correctness and relevance.
4. If the answer is unrelated, off-topic, or does not address the question, assign a low score regardless of fluency, confidence, length, grammar, or speaking style.
5. Never reward candidates simply for speaking well if the content is incorrect or irrelevant.
6. Accept answers that are technically correct even if they use different wording, examples, or sentence structure.
7. Do not require textbook definitions or exact wording.
8. Do not be overly lenient by accepting vague, generic, or incomplete responses.
9. Evaluate exactly like an experienced human interviewer.
10. Ignore filler words, pauses, hesitation, repetitions, grammar mistakes, pronunciation issues, and minor speech recognition errors unless they change the meaning.
11. A long pause or fluent delivery must not increase or decrease the correctness score.
12. If the response demonstrates correct understanding of the concept, award appropriate marks.
13. If the response is partially correct, give partial credit and clearly explain what is correct and what is missing.
14. If the response is incorrect or unrelated, clearly explain why it does not answer the question and assign an appropriately low score.
15. If the answer is ambiguous, evaluate based on the interpretation that is most reasonably supported by the candidate's words. Do not make assumptions or fill in missing information.
16. Be consistent and unbiased. Two candidates giving answers of the same quality should receive the same score every time.
17. Always justify your score using evidence from the candidate's actual response.
## Evaluation Priority (Highest → Lowest)
1. Relevance to the interview question
2. Technical correctness
3. Completeness
4. Logical explanation and reasoning
5. Communication quality
Communication quality should have the lowest weight and should never compensate for incorrect or irrelevant content.
## Scoring Guidelines
- **9–10:** Fully answers the question. Technically correct, relevant, complete, and logically explained.
- **7–8:** Mostly correct with only minor missing details or small inaccuracies.
- **5–6:** Partially correct. Demonstrates some understanding but misses important concepts or explanations.
- **3–4:** Limited understanding. Contains significant mistakes, incomplete reasoning, or only partially addresses the question.
- **0–2:** Incorrect, irrelevant, off-topic, or does not answer the question.
## Output Format
### Question Understanding
Briefly explain what the interviewer wanted to assess.
### Candidate Answer Summary
Summarize what the candidate actually said.
### Relevance
Yes / Partially / No
### Technical Correctness
Correct / Partially Correct / Incorrect
### Strengths
- List what the candidate answered correctly.
### Missing or Incorrect Points
- Explain what was missing, incorrect, or why the response failed to answer the question.
### Final Score
X/10
### Verdict
Correct / Partially Correct / Incorrect
### Reason
Provide a concise justification for the score using evidence from the candidate's actual answer. Focus primarily on whether the candidate answered the interview question correctly, not on how fluently they spoke.`;

  const FIELD_LABELS = [
    "Question Understanding", "Candidate Answer Summary", "Relevance",
    "Technical Correctness", "Strengths", "Missing or Incorrect Points",
    "Final Score", "Verdict", "Reason"
  ];

  function getApiKey() {
    try { return (localStorage.getItem(KEY_STORAGE) || "").trim(); }
    catch (e) { return ""; }
  }

  function setApiKey(key) {
    try {
      const trimmed = (key || "").trim();
      if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed);
      else localStorage.removeItem(KEY_STORAGE);
      return true;
    } catch (e) {
      return false;
    }
  }

  function hasApiKey() { return getApiKey().length > 0; }

  function buildUserMessage(question, answerText) {
    const answer = (answerText || "").trim();
    return (
      `Interview Question:\n${question || "(no question text)"}\n\n` +
      `Candidate's Spoken Answer (auto-transcribed, may contain minor recognition errors — ` +
      `judge the substance, not the transcription):\n` +
      `${answer || "(No answer was recorded — the candidate did not respond before time ran out or the question was skipped.)"}`
    );
  }

  function escapeForRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /** Parse the model's structured text output into a field map, without
   *  assuming perfectly clean formatting. */
  function parseEvaluation(raw) {
    const text = (raw || "").trim();
    const result = { raw: text, score10: null, verdict: null };

    const labelAlternation = FIELD_LABELS.map(escapeForRegex).join("|");
    const pattern = new RegExp(`(?:^|\\n)[\\s\\-\\*]*\\**(${labelAlternation})\\**\\s*:?[ \\t]*`, "gi");
    const matches = [...text.matchAll(pattern)];

    matches.forEach((m, i) => {
      const label = m[1];
      const start = m.index + m[0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
      const value = text.slice(start, end).trim();
      const key = label.trim().toLowerCase().replace(/[^a-z]+/g, "_");
      result[key] = value;
    });

    const scoreMatch = text.match(/Final Score\**\s*:?\s*([\d.]+)\s*\/\s*10/i);
    if (scoreMatch) result.score10 = parseFloat(scoreMatch[1]);

    const verdictMatch = text.match(/Verdict\**\s*:?\s*\**\s*(Partially Correct|Correct|Incorrect)/i);
    if (verdictMatch) {
      const v = verdictMatch[1].toLowerCase();
      result.verdict = v === "correct" ? "Correct" : v === "incorrect" ? "Incorrect" : "Partially Correct";
    }

    return result;
  }

  async function evaluateAnswer(question, answerText) {
    const apiKey = getApiKey();
    if (!apiKey) {
      const err = new Error("no-api-key");
      err.code = "no-api-key";
      throw err;
    }

    let response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: { role: "system", parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: buildUserMessage(question, answerText) }] }],
          generationConfig: {
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            temperature: 0.1
          }
        })
      });
    } catch (networkErr) {
      const err = new Error("network-error");
      err.code = "network-error";
      throw err;
    }

    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = (body && body.error && body.error.message) || "";
      } catch (e) { /* ignore parse failure */ }
      const err = new Error(detail || `http-${response.status}`);
      // Gemini returns 400 for a malformed/invalid key and 403 for a key
      // that's valid but not permitted (API not enabled, wrong project, etc).
      err.code = (response.status === 400 || response.status === 401 || response.status === 403)
        ? "invalid-key"
        : `http-${response.status}`;
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    const candidate = data.candidates && data.candidates[0];
    const parts = candidate && candidate.content && candidate.content.parts;
    const text = Array.isArray(parts)
      ? parts.map((p) => p.text || "").join("\n").trim()
      : "";

    if (!text) {
      const finishReason = candidate && candidate.finishReason;
      const err = new Error(`empty-response${finishReason ? `: ${finishReason}` : ""}`);
      err.code = "empty-response";
      throw err;
    }

    return parseEvaluation(text);
  }

  /**
   * Evaluate every question/answer pair in a session, one at a time (to stay
   * gentle on rate limits), calling onProgress(index, evaluationOrNull, error)
   * after each one completes so the UI can render results as they arrive.
   */
  async function evaluateSession(answerRecords, onProgress) {
    const results = new Array(answerRecords.length).fill(null);
    for (let i = 0; i < answerRecords.length; i++) {
      const a = answerRecords[i] || {};
      try {
        const evaluation = await evaluateAnswer(a.question, a.text);
        results[i] = evaluation;
        if (onProgress) onProgress(i, evaluation, null);
      } catch (err) {
        if (onProgress) onProgress(i, null, err);
        if (err && (err.code === "invalid-key" || err.code === "no-api-key")) break;
      }
    }
    return results;
  }

  return { getApiKey, setApiKey, hasApiKey, evaluateAnswer, evaluateSession, parseEvaluation };
})();