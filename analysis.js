/* ==========================================================================
   analysis.js — communication scoring engine.

   Scoring is deterministic and based on transcript, recognizer confidence,
   timing, pauses, filler words and vocabulary signals.
   ========================================================================== */

const Analysis = (() => {

  const FILLER_WORDS = ["um", "uh", "umm", "uhh", "like", "you know", "sort of", "kind of", "actually", "basically", "literally"];

  const COMMON_WORDS = new Set(("the a an and or but if so to of in on at for with is are was were be been being " +
    "i you he she it we they my your his her its our their this that these those have has had do does did " +
    "not no yes can could will would should may might just very really good bad get got go going know think " +
    "want like as well also more most some any all about because when what who how why which there here then than").split(" "));

  const CONTENT_STOP_WORDS = new Set([...COMMON_WORDS, "me", "am", "from", "by", "into", "up", "down", "out", "over", "under"]);

  const GRAMMAR_PATTERNS = [
    { re: /\b(he|she|it)\s+(go|have|do|like|want|think|know|believe|work|study|live|play)\b/gi, weight: 1.3 },
    { re: /\b(i)\s+(are|were|has|does)\b/gi, weight: 1.4 },
    { re: /\b(i)\s+is\b/gi, weight: 1.6 },
    { re: /\b(they|we|you)\s+was\b/gi, weight: 1.4 },
    { re: /\b(he|she|it)\s+are\b/gi, weight: 1.4 },
    { re: /\b(did|didn't|doesn't|don't)\s+\w+(ed|went|s)\b/gi, weight: 1.2 },
    { re: /\b(can|could|will|would|should|must)\s+\w+(ed|s)\b/gi, weight: 1.1 },
    { re: /\b(don't|doesn't|didn't|can't|won't)\s+\w+\s+no\b/gi, weight: 1.6 },
    { re: /\bmore\s+better\b|\bmost\s+best\b/gi, weight: 1.5 },
    { re: /\bdiscuss\s+about\b|\breturn\s+back\b|\brevert\s+back\b/gi, weight: 1.1 },
    { re: /\bi\s+am\s+agree\b|\bi\s+am\s+belong\b|\bi\s+am\s+having\b/gi, weight: 1.5 },
    { re: /\bone\s+of\s+my\s+(friend|hobby|skill|project)\b/gi, weight: 1.2 },
    { re: /\baccording\s+to\s+me\b/gi, weight: 0.9 },
    { re: /\b(\w+)\s+\1\b/gi, weight: 1.0 }
  ];

  function wordsOf(text) {
    return Utils.wordsOf(text);
  }

  function sentenceParts(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return [];
    const normalized = trimmed.replace(/\s+/g, " ");
    const parts = normalized.split(/[.!?]+|\n+/).map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : [normalized];
  }

  function repeatedContentWords(lowerWords) {
    const counts = {};
    lowerWords.forEach((w) => {
      if (w.length < 4 || CONTENT_STOP_WORDS.has(w)) return;
      counts[w] = (counts[w] || 0) + 1;
    });
    return Object.values(counts).reduce((sum, count) => sum + Math.max(0, count - 2), 0);
  }

  function analyzeAnswerText(text) {
    const words = wordsOf(text);
    const wordCount = words.length;
    const lowerWords = words.map(w => w.toLowerCase());
    const uniqueWords = new Set(lowerWords);
    const ttr = wordCount > 0 ? uniqueWords.size / wordCount : 0;
    const avgWordLength = wordCount > 0 ? lowerWords.reduce((s, w) => s + w.length, 0) / wordCount : 0;
    const commonCount = lowerWords.filter(w => COMMON_WORDS.has(w)).length;
    const commonRatio = wordCount > 0 ? commonCount / wordCount : 0;
    const repeatedWords = repeatedContentWords(lowerWords);
    const repeatedRatio = wordCount > 0 ? repeatedWords / wordCount : 0;
    const fillers = Utils.countFillers(text, FILLER_WORDS);

    let grammarIssues = 0;
    GRAMMAR_PATTERNS.forEach(p => {
      const matches = text.match(p.re);
      if (matches) grammarIssues += matches.length * p.weight;
    });

    const sentences = sentenceParts(text);
    const sentenceWordCounts = sentences.map(s => wordsOf(s).length).filter(Boolean);
    const sentenceCount = sentenceWordCounts.length;
    const avgSentenceLength = sentenceCount ? sentenceWordCounts.reduce((s, n) => s + n, 0) / sentenceCount : 0;
    const fragmentCount = sentenceWordCounts.filter(n => n > 0 && n < 5).length;
    const runOnCount = sentenceWordCounts.filter(n => n > 28).length;
    const shortAnswerPenalty = wordCount > 0 && wordCount < 12 ? 1 : 0;
    const punctuationMissing = wordCount >= 18 && !/[.!?]/.test(text) ? 1 : 0;
    const sentenceIssues = fragmentCount + runOnCount + shortAnswerPenalty + punctuationMissing;

    return {
      wordCount, ttr, avgWordLength, commonRatio, repeatedWords, repeatedRatio,
      fillerTotal: fillers.total, fillerBreakdown: fillers.breakdown,
      grammarIssues, sentenceCount, avgSentenceLength, fragmentCount, runOnCount,
      punctuationMissing, sentenceIssues
    };
  }

  function capExcellent(score, stats, signals) {
    const strongEnough =
      stats.wordCount >= 45 &&
      stats.grammarIssues < 1 &&
      stats.sentenceIssues <= 1 &&
      signals.fillerRatioPct <= 2.2 &&
      signals.pauseRatio <= 0.12 &&
      signals.wpm >= 105 &&
      signals.wpm <= 155;
    return strongEnough ? score : Math.min(score, 89);
  }

  function scoreAnswer(a) {
    const text = a.text || "";
    const answerSeconds = Math.max(1, a.durationSeconds || a.answerDurationSeconds || 1);
    const questionSeconds = Math.max(answerSeconds, a.questionDurationSeconds || answerSeconds);
    const stats = analyzeAnswerText(text);
    const wpm = stats.wordCount / (answerSeconds / 60);
    const longPauses = (a.pauseGaps || []).filter(g => g > 1.2);
    const pauseSeconds = longPauses.reduce((s, v) => s + v, 0);
    const pauseCount = longPauses.length;
    const avgPause = pauseCount ? pauseSeconds / pauseCount : 0;
    const speakingSeconds = Utils.clamp(answerSeconds - pauseSeconds, 0, answerSeconds);
    const silentSeconds = Math.max(0, questionSeconds - speakingSeconds - pauseSeconds);
    const pauseRatio = answerSeconds > 0 ? pauseSeconds / answerSeconds : 0;
    const silentRatio = questionSeconds > 0 ? silentSeconds / questionSeconds : 0;
    const fillerRatioPct = stats.wordCount > 0 ? (stats.fillerTotal / stats.wordCount) * 100 : 0;
    const grammarIssueRate = stats.wordCount > 0 ? (stats.grammarIssues / stats.wordCount) * 100 : 0;

    if (stats.wordCount === 0) {
      return {
      text, wordCount: 0, durationSeconds: answerSeconds, questionDurationSeconds: questionSeconds,
        speakingSeconds: 0, silentSeconds: questionSeconds, pauseSeconds: 0, wpm: 0,
        fillerTotal: 0, fillerBreakdown: {}, fillerRatioPct: 0, pauseCount: 0, avgPause: 0,
        grammarIssues: 0, sentenceIssues: 0, pronunciationIsEstimate: true,
        analysisNotes: ["No spoken answer was captured, so the response could not be evaluated."],
        scores: { fluency: 0, grammar: 0, pronunciation: 0, confidence: 0, vocabulary: 0, overall: 0 }
      };
    }

    const pacePenalty = wpm < 95 ? (95 - wpm) * 0.65 : wpm > 165 ? (wpm - 165) * 0.7 : Math.abs(wpm - 125) * 0.08;
    const pausePenalty = Utils.clamp(pauseCount * 5 + pauseRatio * 42 + Math.max(0, avgPause - 2) * 6, 0, 45);
    const fillerPenalty = Utils.clamp(fillerRatioPct * 3.2, 0, 32);
    const brevityPenalty = stats.wordCount < 18 ? (18 - stats.wordCount) * 1.8 : 0;
    let fluency = Utils.clamp(86 - pacePenalty - pausePenalty - fillerPenalty - brevityPenalty, 0, 92);

    let grammar = Utils.clamp(
      82 - grammarIssueRate * 5.5 - stats.sentenceIssues * 5 - stats.fragmentCount * 3 - stats.runOnCount * 4,
      0, 88
    );
    if (stats.wordCount < 12) grammar = Math.min(grammar, 62);
    if (stats.grammarIssues >= 1) grammar = Math.min(grammar, 84);
    if (stats.grammarIssues >= 2 || grammarIssueRate > 5) grammar = Math.min(grammar, 74);
    if (stats.grammarIssues >= 4 || grammarIssueRate > 9) grammar = Math.min(grammar, 62);

    const validConfidences = (a.confidences || []).filter(c => c > 0);
    let pronunciation;
    let pronunciationIsEstimate = false;
    if (validConfidences.length > 0) {
      const avgConf = validConfidences.reduce((s, v) => s + v, 0) / validConfidences.length;
      pronunciation = Utils.clamp(avgConf * 94 - fillerRatioPct * 1.1 - pauseRatio * 12, 35, 92);
    } else {
      pronunciationIsEstimate = true;
      pronunciation = Utils.clamp(76 - fillerRatioPct * 1.5 - pauseRatio * 22 - Math.max(0, wpm - 170) * 0.18 + Utils.clamp((stats.avgWordLength - 4) * 2.5, -6, 6), 35, 84);
    }

    let volumeScore = 62;
    if (a.volumeSamples && a.volumeSamples.length > 4) {
      const mean = a.volumeSamples.reduce((s, v) => s + v, 0) / a.volumeSamples.length;
      const variance = a.volumeSamples.reduce((s, v) => s + (v - mean) ** 2, 0) / a.volumeSamples.length;
      const stdev = Math.sqrt(variance);
      const meanScore = Utils.clamp(mean * 135, 20, 88);
      const steadiness = Utils.clamp(86 - stdev * 210, 20, 88);
      volumeScore = Utils.clamp(meanScore * 0.55 + steadiness * 0.45, 20, 88);
    }
    const completeness = Utils.clamp(stats.wordCount / 45, 0.35, 1);
    let confidence = Utils.clamp(fluency * 0.38 + volumeScore * 0.34 + (100 - fillerPenalty) * 0.18 + completeness * 10 - silentRatio * 20, 0, 90);

    const ttrExpected = stats.wordCount < 35 ? 0.78 : 0.58;
    const ttrScore = Utils.clamp((stats.ttr / ttrExpected) * 72, 20, 88);
    const richnessScore = Utils.clamp((1 - stats.commonRatio) * 95, 15, 88);
    const lengthScore = Utils.clamp((stats.avgWordLength - 3.2) * 16 + 52, 20, 86);
    let vocabulary = Utils.clamp(ttrScore * 0.38 + richnessScore * 0.38 + lengthScore * 0.24 - stats.repeatedRatio * 140, 0, 88);
    if (stats.wordCount < 18) vocabulary = Math.min(vocabulary, 62);
    if (stats.repeatedRatio > 0.08) vocabulary = Math.min(vocabulary, 70);

    const signals = { fillerRatioPct, pauseRatio, wpm };
    fluency = capExcellent(fluency, stats, signals);
    grammar = capExcellent(grammar, stats, signals);
    pronunciation = capExcellent(pronunciation, stats, signals);
    confidence = capExcellent(confidence, stats, signals);
    vocabulary = capExcellent(vocabulary, stats, signals);

    let overall = fluency * 0.24 + grammar * 0.24 + pronunciation * 0.18 + confidence * 0.18 + vocabulary * 0.16;
    overall -= Utils.clamp(fillerRatioPct - 3, 0, 12) * 0.7;
    overall -= Utils.clamp(pauseRatio - 0.18, 0, 0.5) * 22;
    overall -= stats.wordCount < 20 ? (20 - stats.wordCount) * 0.8 : 0;
    overall = Math.min(overall, Math.min(grammar + 18, fluency + 18));
    overall = capExcellent(overall, stats, signals);
    if (grammar < 65) overall = Math.min(overall, 72);
    if (fluency < 55 || stats.wordCount < 12) overall = Math.min(overall, 62);

    const analysisNotes = buildAnswerNotes(stats, { wpm, fillerRatioPct, pauseCount, avgPause, pauseSeconds, silentSeconds, grammarIssueRate });

    return {
      text, wordCount: stats.wordCount, durationSeconds: answerSeconds, questionDurationSeconds: questionSeconds,
      speakingSeconds: Utils.round(speakingSeconds, 1), silentSeconds: Utils.round(silentSeconds, 1), pauseSeconds: Utils.round(pauseSeconds, 1),
      wpm: Utils.round(wpm), fillerTotal: stats.fillerTotal, fillerBreakdown: stats.fillerBreakdown,
      fillerRatioPct: Utils.round(fillerRatioPct, 1), pauseCount, avgPause: Utils.round(avgPause, 1),
      grammarIssues: Utils.round(stats.grammarIssues, 1), sentenceIssues: stats.sentenceIssues,
      repeatedWords: stats.repeatedWords, ttr: Utils.round(stats.ttr, 2), avgSentenceLength: Utils.round(stats.avgSentenceLength, 1),
      pronunciationIsEstimate, analysisNotes,
      scores: {
        fluency: Utils.round(fluency), grammar: Utils.round(grammar), pronunciation: Utils.round(pronunciation),
        confidence: Utils.round(confidence), vocabulary: Utils.round(vocabulary), overall: Utils.round(overall)
      }
    };
  }

  function scoreSession(answerRecords) {
    const scored = answerRecords.map(scoreAnswer);
    const withWords = scored.filter(s => s.wordCount > 0);
    const basis = scored.length ? scored : [{ scores: { fluency: 0, grammar: 0, pronunciation: 0, confidence: 0, vocabulary: 0, overall: 0 }, wordCount: 0 }];
    const avg = (key) => basis.length ? Utils.round(basis.reduce((s, r) => s + r.scores[key], 0) / basis.length) : 0;

    const scores = {
      fluency: avg("fluency"), grammar: avg("grammar"), pronunciation: avg("pronunciation"),
      confidence: avg("confidence"), vocabulary: avg("vocabulary")
    };
    let overall = Utils.round(
      scores.fluency * 0.24 + scores.grammar * 0.24 + scores.pronunciation * 0.18 +
      scores.confidence * 0.18 + scores.vocabulary * 0.16
    );

    const totalFillers = scored.reduce((s, r) => s + r.fillerTotal, 0);
    const totalWords = scored.reduce((s, r) => s + r.wordCount, 0);
    const totalPauses = scored.reduce((s, r) => s + r.pauseCount, 0);
    const pauseSeconds = scored.reduce((s, r) => s + (r.pauseSeconds || 0), 0);
    const totalAnswerTime = scored.reduce((s, r) => s + (r.durationSeconds || 0), 0);
    const totalQuestionTime = scored.reduce((s, r) => s + (r.questionDurationSeconds || r.durationSeconds || 0), 0);
    const speakingSeconds = scored.reduce((s, r) => s + (r.speakingSeconds || 0), 0);
    const silentSeconds = Math.max(0, totalQuestionTime - speakingSeconds - pauseSeconds);
    const avgWpm = withWords.length ? Utils.round(withWords.reduce((s, r) => s + r.wpm, 0) / withWords.length) : 0;
    const usedEstimatePronunciation = scored.some(s => s.pronunciationIsEstimate);

    if (totalWords < 30) overall = Math.min(overall, 64);
    if (scores.grammar < 65) overall = Math.min(overall, 72);
    if (scores.fluency < 55) overall = Math.min(overall, 65);
    if (!(scores.grammar >= 88 && scores.fluency >= 88 && scores.pronunciation >= 86 && scores.confidence >= 84 && scores.vocabulary >= 84 && totalWords >= 90)) {
      overall = Math.min(overall, 89);
    }

    const totals = {
      totalFillers, totalWords, totalPauses, avgWpm,
      pauseSeconds: Utils.round(pauseSeconds, 1),
      speakingSeconds: Utils.round(speakingSeconds, 1),
      silentSeconds: Utils.round(silentSeconds, 1),
      totalAnswerTime: Utils.round(totalAnswerTime, 1),
      totalQuestionTime: Utils.round(totalQuestionTime, 1)
    };
    const { strengths, weaknesses, suggestions } = buildFeedback(scores, totals, scored);

    return { overall, scores, perAnswer: scored, totals, usedEstimatePronunciation, strengths, weaknesses, suggestions };
  }

  const STRENGTH_PHRASES = {
    fluency: "Good fluency: your pace and rhythm stayed mostly controlled.",
    grammar: "Grammar was a relative strength, with few clear structural mistakes.",
    pronunciation: "Pronunciation was clear enough for the recognizer to follow well.",
    confidence: "Confident delivery: your voice pattern was steady and engaged.",
    vocabulary: "Good vocabulary variety with fewer repeated basic words."
  };
  const WEAKNESS_PHRASES = {
    fluency: "Fluency needs work: pauses, fillers or pace made the answer feel uneven.",
    grammar: "Weak grammar: sentence structure or subject-verb agreement reduced clarity.",
    pronunciation: "Pronunciation clarity was inconsistent, so some words may not land clearly.",
    confidence: "Delivery sounded hesitant or low-energy in parts.",
    vocabulary: "Vocabulary was repetitive or too basic for a strong interview answer."
  };
  const SUGGESTION_PHRASES = {
    fluency: "Practice one-minute answers with a steady pace: make one point, pause briefly, then continue.",
    grammar: "Use complete sentences with a clear subject and verb before adding details.",
    pronunciation: "Record one answer, replay it, and repeat unclear words slowly before answering again.",
    confidence: "Sit upright, take one breath before speaking, and keep your volume consistent.",
    vocabulary: "Prepare two or three precise words for each common topic before you practice."
  };

  function buildAnswerNotes(stats, signals) {
    const notes = [];
    if (stats.wordCount < 12) notes.push("Answer was too short to show a complete idea.");
    if (stats.sentenceIssues > 0) notes.push("Sentence structure needs attention: use complete, well-punctuated thoughts.");
    if (stats.grammarIssues >= 1) notes.push("Likely grammar slips detected in agreement, tense or repeated wording.");
    if (signals.fillerRatioPct > 4) notes.push(`Filler words were noticeable (${Utils.round(signals.fillerRatioPct, 1)}% of words).`);
    if (signals.pauseCount >= 2) notes.push(`Frequent long pauses interrupted the answer (${signals.pauseCount} pauses).`);
    if (signals.wpm < 95) notes.push("Speaking pace was slow, which can sound hesitant.");
    if (signals.wpm > 165) notes.push("Speaking pace was fast, which can reduce clarity.");
    if (stats.repeatedWords > 0) notes.push("Some content words were repeated; add more vocabulary variety.");
    if (notes.length === 0) notes.push("Answer was understandable; improve it further with more specific examples.");
    return notes;
  }

  function buildFeedback(scores, totals, perAnswer) {
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const strengths = [];
    const weaknesses = [];
    const suggestions = [];
    const fillerPct = totals.totalWords > 0 ? (totals.totalFillers / totals.totalWords) * 100 : 0;
    const pauseRatio = totals.totalAnswerTime > 0 ? totals.pauseSeconds / totals.totalAnswerTime : 0;
    const avgAnswerWords = perAnswer.length ? totals.totalWords / perAnswer.length : 0;
    const silentRatio = totals.totalQuestionTime > 0 ? totals.silentSeconds / totals.totalQuestionTime : 0;

    ranked.forEach(([key, val]) => {
      if (val >= 78 && strengths.length < 3) strengths.push(STRENGTH_PHRASES[key]);
      if (val < 68) {
        weaknesses.push(WEAKNESS_PHRASES[key]);
        suggestions.push(SUGGESTION_PHRASES[key]);
      }
    });

    if (fillerPct > 4) {
      weaknesses.push(`Excessive filler words: ${Utils.round(fillerPct, 1)} fillers per 100 words.`);
      suggestions.push("Reduce filler words by replacing 'um', 'uh', 'like' and 'you know' with a short silent pause.");
    }
    if (totals.totalPauses >= 3 || pauseRatio > 0.18) {
      weaknesses.push("Frequent pauses made the answer sound less prepared.");
      suggestions.push("Before answering, mentally choose two points: situation and result. This reduces mid-answer pauses.");
    }
    if (totals.avgWpm && totals.avgWpm < 95) {
      weaknesses.push("Speaking pace was slow and may sound hesitant.");
      suggestions.push("Aim for 110-150 words per minute for natural interview speech.");
    } else if (totals.avgWpm && totals.avgWpm > 165) {
      weaknesses.push("Speaking pace was too quick in places.");
      suggestions.push("Slow down on important words and pause briefly after each key point.");
    }
    if (silentRatio > 0.35) {
      weaknesses.push("Too much interview time passed without a spoken answer.");
      suggestions.push("Start with a direct first sentence, then add details. This reduces silent time and makes the answer feel prepared.");
    }
    if (avgAnswerWords > 0 && avgAnswerWords < 25) {
      weaknesses.push("Answers were brief, so they lacked enough detail for strong interview scoring.");
      suggestions.push("Use a simple structure: answer directly, give one example, and finish with what you learned.");
    }
    if (scores.grammar < 70) {
      suggestions.push("Practice common sentence frames: 'I worked on...', 'I learned...', 'The result was...'.");
    }
    if (scores.vocabulary < 70) {
      suggestions.push("After each practice answer, rewrite two basic words with more specific alternatives.");
    }

    if (strengths.length === 0 && totals.totalWords > 0) strengths.push("You completed spoken answers, which gives you a clear baseline to improve from.");
    if (weaknesses.length === 0) weaknesses.push("No major weakness dominated the session; focus on making answers more specific and polished.");
    if (suggestions.length === 0) suggestions.push("Keep practicing with the same question until your pace, grammar and vocabulary stay consistent.");

    const dedupe = (arr) => Array.from(new Set(arr));
    return { strengths: dedupe(strengths), weaknesses: dedupe(weaknesses), suggestions: dedupe(suggestions) };
  }

  return { scoreAnswer, scoreSession, FILLER_WORDS };
})();
