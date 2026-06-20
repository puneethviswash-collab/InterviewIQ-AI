/* ==========================================================================
   questions.js — adaptive question bank and option-aware generation.
   ========================================================================== */

const Questions = (() => {

  const BEGINNER_QUESTIONS = [
    "Introduce yourself.",
    "Describe your hometown.",
    "Talk about your hobbies.",
    "Describe your favorite food.",
    "Explain your daily routine.",
    "Describe your family.",
    "Describe your favorite movie.",
    "Talk about your best friend.",
    "Describe your school or college.",
    "Explain your favorite subject.",
    "Describe your favorite festival.",
    "Talk about your dream job.",
    "Describe your favorite book.",
    "Explain your weekend activities.",
    "Describe a place you like to visit.",
    "Talk about one skill you want to learn.",
    "Describe your favorite teacher.",
    "Explain what makes you feel confident."
  ];

  const INTERMEDIATE_QUESTIONS = [
    "Describe a challenge you faced.",
    "Explain a recent achievement.",
    "Describe a difficult decision you made.",
    "Explain how you solved a problem.",
    "Tell me about a time you worked with a team.",
    "Explain how you manage your time.",
    "Describe a situation where communication was important.",
    "Tell me about feedback you received and how you used it.",
    "Describe a time you had to adapt to a change.",
    "Explain what makes a good teammate.",
    "Talk about a project you are proud of.",
    "Explain how you stay motivated.",
    "Tell me about a time you handled criticism.",
    "Explain how you would deal with a conflict."
  ];

  const ADVANCED_QUESTIONS = [
    "How will artificial intelligence change the way people work?",
    "What should individuals and companies do about climate change?",
    "Explain a business strategy that can help a company grow.",
    "What qualities are important for successful entrepreneurship?",
    "Which future technology do you think will have the biggest impact?",
    "How does the global economy affect career opportunities?",
    "How can leaders manage teams during uncertain economic conditions?",
    "What skills will be most valuable in the next ten years?",
    "How can companies build trust when using customer data?",
    "What does responsible leadership mean in a global economy?"
  ];

  const TYPE_LABELS = { hr: "HR", behavioral: "Behavioral", technical: "Technical", general: "General Communication" };
  const TOPIC_LABELS = {
    technology: "Technology", education: "Education", sports: "Sports", environment: "Environment",
    leadership: "Leadership", ai: "Artificial Intelligence", business: "Business", science: "Science",
    communication: "Communication", random: "General"
  };
  const COMPANY_LABELS = { google: "Google", amazon: "Amazon", microsoft: "Microsoft", tcs: "TCS", infosys: "Infosys" };

  const TYPE_QUESTIONS = {
    hr: {
      beginner: [
        "Tell me about yourself in a clear and simple way.",
        "Why are you interested in this role?",
        "What is one strength you would bring to a team?",
        "What kind of work environment helps you do your best?"
      ],
      intermediate: [
        "Why should we hire you for this role?",
        "Describe a weakness you are actively improving.",
        "What motivates you at work?",
        "How would your classmates or colleagues describe you?",
        "What are you looking for in your next opportunity?"
      ],
      advanced: [
        "Where do you see your career going over the next five years, and why?",
        "How would you handle a role that changes faster than expected?",
        "What would make you choose one company over another?"
      ]
    },
    behavioral: {
      beginner: [
        "Describe a time you helped someone.",
        "Talk about a time you learned from a mistake.",
        "Describe a time you finished an important task."
      ],
      intermediate: [
        "Describe a challenge you faced and how you handled it.",
        "Tell me about a time you disagreed with a teammate. What did you do?",
        "Describe a situation where you had to meet a tight deadline.",
        "Tell me about a time you went above and beyond for a project."
      ],
      advanced: [
        "Tell me about a time you made a difficult decision with limited information.",
        "Describe a time you had to influence someone without authority.",
        "Tell me about a time you gave difficult feedback and what happened next."
      ]
    },
    technical: {
      beginner: [
        "Explain a technical skill you are learning.",
        "Describe a simple project you have worked on.",
        "What technical topic do you enjoy and why?"
      ],
      intermediate: [
        "Explain a technical concept from your field to someone non-technical.",
        "Describe a project where you had to solve a technical problem.",
        "How do you keep your technical skills up to date?",
        "How do you decide when a solution is good enough?"
      ],
      advanced: [
        "Walk me through how you would debug a system you have never seen before.",
        "Describe a trade-off you made between speed, quality, and maintainability.",
        "How would you explain your most complex project to an interviewer?"
      ]
    },
    general: {
      beginner: [
        "Talk about a topic you enjoy discussing.",
        "Describe your ideal day.",
        "Explain one habit that helps you communicate better."
      ],
      intermediate: [
        "What does good communication look like to you?",
        "Describe a time you had to explain something complicated simply.",
        "Tell me about a book, course, or experience that changed how you think."
      ],
      advanced: [
        "How can people communicate clearly when they strongly disagree?",
        "What makes spoken communication different from written communication?",
        "How would you adapt your communication style for different audiences?"
      ]
    }
  };

  const TOPIC_PROMPTS = {
    technology: {
      subject: "technology",
      beginner: ["Describe a technology you use every day.", "Talk about a useful app or device."],
      intermediate: ["How has technology changed the way people learn or work?", "Describe a technology problem you solved or understood."],
      advanced: ["What technology trend could strongly affect future careers?", "How should companies balance speed and safety when adopting new technology?"]
    },
    ai: {
      subject: "artificial intelligence",
      beginner: ["Explain what artificial intelligence means in simple words.", "Describe one way you use AI or automation."],
      intermediate: ["How can artificial intelligence improve everyday work?", "Describe a realistic benefit and risk of using AI."],
      advanced: ["Where should artificial intelligence not be used, even if it is possible?", "How should companies prepare employees for AI-driven change?"]
    },
    education: {
      subject: "education",
      beginner: ["Describe a teacher or learning experience you remember.", "Talk about your favorite subject and why you like it."],
      intermediate: ["Do you think online learning is as effective as classroom learning?", "How should students prepare for future careers?"],
      advanced: ["How should education systems respond to jobs that do not exist yet?", "What role should technology play in modern education?"]
    },
    sports: {
      subject: "sports",
      beginner: ["Talk about a sport or game you enjoy.", "Describe a sporting moment you remember."],
      intermediate: ["What can professionals learn from team sports?", "How do sports build discipline and confidence?"],
      advanced: ["Should competitive sports be part of every school's curriculum?", "How can sports leadership lessons apply to business teams?"]
    },
    environment: {
      subject: "environment",
      beginner: ["Describe one habit that helps the environment.", "Talk about a place in nature you like."],
      intermediate: ["How can people balance convenience and sustainability?", "What can companies do to reduce environmental impact?"],
      advanced: ["How might climate change affect business strategy?", "What responsibilities do companies have toward climate change?"]
    },
    business: {
      subject: "business strategy",
      beginner: ["Describe a business you admire.", "Talk about a product or service you like."],
      intermediate: ["How would you explain a company's value to a customer?", "What makes a business successful over the long term?"],
      advanced: ["How can a small company compete with a larger company?", "Describe a strategy for entering a market with strong competitors."]
    },
    science: {
      subject: "science",
      beginner: ["Talk about a science topic you find interesting.", "Describe a simple scientific idea you know."],
      intermediate: ["How do you separate reliable information from hype?", "How would you explain a scientific idea to a younger student?"],
      advanced: ["What scientific discovery deserves more public attention?", "How should society make decisions when science is complex or uncertain?"]
    },
    leadership: {
      subject: "leadership",
      beginner: ["Describe a leader you respect.", "Talk about one quality of a good leader."],
      intermediate: ["How do you motivate someone who has lost confidence?", "What is the difference between managing and leading?"],
      advanced: ["How should leaders make decisions during uncertainty?", "What does ethical leadership look like in a difficult situation?"]
    },
    communication: {
      subject: "communication",
      beginner: ["Describe someone who communicates clearly.", "Talk about why listening is important."],
      intermediate: ["Describe a situation where communication solved a problem.", "How do you explain a difficult idea simply?"],
      advanced: ["How can teams avoid misunderstandings during high-pressure work?", "How should communication change across cultures or seniority levels?"]
    }
  };

  const COMPANY_PROFILES = {
    google: {
      label: "Google",
      traits: ["innovation", "problem solving", "leadership"],
      beginner: ["Why would you like to work at a company known for innovation like Google?"],
      intermediate: ["Tell me about a time you solved a problem in a creative way, as Google values innovation."],
      advanced: ["How would you lead a team at Google through an ambiguous problem with no obvious solution?"]
    },
    amazon: {
      label: "Amazon",
      traits: ["leadership principles", "customer obsession", "ownership"],
      beginner: ["What does customer focus mean to you?"],
      intermediate: ["Tell me about a time you took ownership of a task from start to finish."],
      advanced: ["How would you make a difficult decision at Amazon while balancing customer obsession and business constraints?"]
    },
    microsoft: {
      label: "Microsoft",
      traits: ["collaboration", "growth mindset"],
      beginner: ["What does a growth mindset mean to you?"],
      intermediate: ["Describe a time you collaborated with others to improve an outcome."],
      advanced: ["How would you build collaboration across teams at Microsoft when priorities conflict?"]
    },
    tcs: {
      label: "TCS",
      traits: ["communication", "teamwork"],
      beginner: ["Why is teamwork important in a service company like TCS?"],
      intermediate: ["Describe a time your communication helped a team complete work successfully."],
      advanced: ["How would you handle a client communication problem at TCS while keeping the team aligned?"]
    },
    infosys: {
      label: "Infosys",
      traits: ["adaptability", "professional ethics"],
      beginner: ["What does professional behavior mean to you?"],
      intermediate: ["Tell me about a time you adapted to a new process or expectation."],
      advanced: ["How would you respond at Infosys if a delivery shortcut created an ethical concern?"]
    }
  };

  const BASE_QUESTIONS = {
    hr: TYPE_QUESTIONS.hr.intermediate,
    behavioral: TYPE_QUESTIONS.behavioral.intermediate,
    technical: TYPE_QUESTIONS.technical.intermediate,
    general: TYPE_QUESTIONS.general.intermediate
  };
  const TOPIC_QUESTIONS = Object.fromEntries(Object.entries(TOPIC_PROMPTS).map(([key, value]) => [key, value.advanced]));
  const COMPANY_QUESTIONS = Object.fromEntries(Object.entries(COMPANY_PROFILES).map(([key, value]) => [key, [value.beginner[0], value.intermediate[0], value.advanced[0]]]));

  function normalize(text) {
    return (text || "").trim().toLowerCase();
  }

  function shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function addQuestion(pool, text, topicLabel, difficulty, source) {
    if (!text) return;
    pool[difficulty].push({ text, topicLabel, difficulty, source });
  }

  function selectedTopic(topic) {
    return topic && topic !== "random" && TOPIC_PROMPTS[topic] ? TOPIC_PROMPTS[topic] : null;
  }

  function selectedCompany(company) {
    return company && company !== "none" && COMPANY_PROFILES[company] ? COMPANY_PROFILES[company] : null;
  }

  function contextLabels(opts) {
    const type = opts.type || "general";
    const topic = selectedTopic(opts.topic);
    const company = selectedCompany(opts.company);
    return {
      type,
      typeLabel: TYPE_LABELS[type] || TYPE_LABELS.general,
      topic,
      topicLabel: topic ? TOPIC_LABELS[opts.topic] : "the role",
      topicSubject: topic ? topic.subject : "your chosen field",
      company,
      companyLabel: company ? company.label : "this company",
      trait: company ? company.traits[0] : "professional judgement"
    };
  }

  function addCompositeQuestions(pool, opts) {
    const type = opts.type || "general";
    const topic = selectedTopic(opts.topic);
    const company = selectedCompany(opts.company);
    const typeLabel = TYPE_LABELS[type] || TYPE_LABELS.general;
    const topicLabel = topic ? TOPIC_LABELS[opts.topic] : "General";
    const primaryTrait = company && company.traits[0];
    const secondaryTrait = company && (company.traits[1] || company.traits[0]);
    const traitText = company ? company.traits.join(", ") : "";

    if (topic) {
      addQuestion(pool, `Give a simple introduction and mention your interest in ${topic.subject}.`, topicLabel, "beginner", "topic");
      addQuestion(pool, `Describe one experience or opinion you have related to ${topic.subject}.`, topicLabel, "intermediate", "topic");
      addQuestion(pool, `What is a major opportunity or risk in ${topic.subject}, and how would you explain it clearly?`, topicLabel, "advanced", "topic");
      addQuestion(pool, `What first made you interested in ${topic.subject}?`, topicLabel, "beginner", "topic");
      addQuestion(pool, `How would you explain ${topic.subject} to a person who is hearing about it for the first time?`, topicLabel, "beginner", "topic");
    }

    if (company) {
      addQuestion(pool, `Why does ${company.traits[0]} matter at ${company.label}?`, company.label, "beginner", "company");
      addQuestion(pool, `Describe a time you showed ${company.traits[0]} or ${company.traits[1]} in a real situation.`, company.label, "intermediate", "company");
      addQuestion(pool, `How would you demonstrate ${company.traits.join(", ")} in a challenging role at ${company.label}?`, company.label, "advanced", "company");
      addQuestion(pool, `What attracts you to ${company.label}'s way of working?`, company.label, "beginner", "company");
      addQuestion(pool, `Which ${company.label} value connects most with your own working style, and why?`, company.label, "intermediate", "company");
    }

    if (topic && company) {
      addQuestion(pool, `Introduce yourself as a candidate interested in ${topic.subject} and ${company.label}.`, `${company.label} + ${topicLabel}`, "beginner", "combined");
      addQuestion(pool, `Why would ${company.label} value ${topic.subject} experience during a ${typeLabel} interview?`, `${company.label} + ${topicLabel}`, "intermediate", "combined");
      addQuestion(pool, `Tell me about a time you solved a problem related to ${topic.subject} using ${primaryTrait}.`, `${company.label} + ${topicLabel}`, "intermediate", "combined");
      addQuestion(pool, `How would you show ${secondaryTrait} while working on a ${topic.subject} project at ${company.label}?`, `${company.label} + ${topicLabel}`, "intermediate", "combined");
      addQuestion(pool, `Imagine ${company.label} is building a solution in ${topic.subject}. How would you approach the people, risks, and communication challenges?`, `${company.label} + ${topicLabel}`, "advanced", "combined");
      addQuestion(pool, `What ethical or practical concern should ${company.label} consider before scaling work in ${topic.subject}?`, `${company.label} + ${topicLabel}`, "advanced", "combined");
    }

    if (topic && type === "technical") {
      addQuestion(pool, `Explain a technical concept connected to ${topic.subject} to someone non-technical.`, topicLabel, "intermediate", "combined");
      addQuestion(pool, `How would you evaluate whether a ${topic.subject} solution is reliable, scalable, and safe?`, topicLabel, "advanced", "combined");
      addQuestion(pool, `What data, tools, or systems would you consider before starting a ${topic.subject} project?`, topicLabel, "advanced", "combined");
    }
    if (topic && type === "behavioral") {
      addQuestion(pool, `Describe a time you had to learn or discuss something related to ${topic.subject}.`, topicLabel, "intermediate", "combined");
      addQuestion(pool, `Tell me about a situation where your judgment mattered while dealing with ${topic.subject}.`, topicLabel, "advanced", "combined");
      addQuestion(pool, `Tell me about a time you changed your opinion after learning more about ${topic.subject}.`, topicLabel, "intermediate", "combined");
    }
    if (topic && type === "hr") {
      addQuestion(pool, `How does your interest in ${topic.subject} connect with your career goals?`, topicLabel, "intermediate", "combined");
      addQuestion(pool, `Why should a company hire you for work that may involve ${topic.subject}?`, topicLabel, "advanced", "combined");
      addQuestion(pool, `What personal strength would help you contribute to a ${topic.subject} team?`, topicLabel, "intermediate", "combined");
    }
    if (topic && type === "general") {
      addQuestion(pool, `Speak for one minute about ${topic.subject} in a clear and organized way.`, topicLabel, "intermediate", "combined");
      addQuestion(pool, `How would you present a balanced opinion about ${topic.subject} to a mixed audience?`, topicLabel, "advanced", "combined");
    }

    if (company && type === "hr") {
      addQuestion(pool, `Why do you think you would be a good cultural fit for ${company.label}?`, company.label, "intermediate", "combined");
      addQuestion(pool, `How would your career goals align with ${company.label}'s focus on ${traitText}?`, company.label, "advanced", "combined");
    }
    if (company && type === "behavioral") {
      addQuestion(pool, `Tell me about a time you demonstrated ${primaryTrait}, which is important at ${company.label}.`, company.label, "intermediate", "combined");
      addQuestion(pool, `Describe a situation where you had to balance ${primaryTrait} with ${secondaryTrait}.`, company.label, "advanced", "combined");
    }
    if (company && type === "technical") {
      addQuestion(pool, `How would you explain a technical project in a way that reflects ${company.label}'s focus on ${primaryTrait}?`, company.label, "intermediate", "combined");
      addQuestion(pool, `How would you handle a technical trade-off at ${company.label} while preserving ${secondaryTrait}?`, company.label, "advanced", "combined");
    }
    if (company && type === "general") {
      addQuestion(pool, `Give a clear two-minute answer about why ${company.label} interests you.`, company.label, "intermediate", "combined");
      addQuestion(pool, `How would you adjust your communication style for a professional discussion at ${company.label}?`, company.label, "advanced", "combined");
    }
  }

  function buildProgressionPool(opts) {
    const type = opts.type || "general";
    const topic = selectedTopic(opts.topic);
    const company = selectedCompany(opts.company);
    const typeLabel = TYPE_LABELS[type] || TYPE_LABELS.general;
    const pool = { beginner: [], intermediate: [], advanced: [] };

    BEGINNER_QUESTIONS.forEach(q => addQuestion(pool, q, "Beginner", "beginner", "general"));
    INTERMEDIATE_QUESTIONS.forEach(q => addQuestion(pool, q, "Intermediate", "intermediate", "general"));
    ADVANCED_QUESTIONS.forEach(q => addQuestion(pool, q, "Advanced", "advanced", "general"));

    ["beginner", "intermediate", "advanced"].forEach((level) => {
      (TYPE_QUESTIONS[type] || TYPE_QUESTIONS.general)[level].forEach(q => addQuestion(pool, q, typeLabel, level, "type"));
      if (topic) topic[level].forEach(q => addQuestion(pool, q, TOPIC_LABELS[opts.topic], level, "topic"));
      if (company) company[level].forEach(q => addQuestion(pool, q, company.label, level, "company"));
    });

    (opts.resumeQuestions || []).forEach(q => addQuestion(pool, q, "From your resume", "intermediate", "resume"));
    addCompositeQuestions(pool, opts);
    return pool;
  }

  function durationPlan(duration, count) {
    if (duration <= 60) return Array(count).fill("beginner");
    if (duration <= 120) return Array(count).fill("beginner");
    if (duration <= 300) {
      return Array.from({ length: count }, (_, i) => (i < Math.ceil(count * 0.45) ? "beginner" : "intermediate"));
    }
    return Array.from({ length: count }, (_, i) => {
      if (i < Math.ceil(count * 0.3)) return "beginner";
      if (i < Math.ceil(count * 0.72)) return "intermediate";
      return "advanced";
    });
  }

  function countForDuration(duration, fallback) {
    if (fallback) return fallback;
    if (duration <= 60) return 2;
    if (duration <= 120) return 3;
    if (duration <= 300) return 5;
    return 8;
  }

  function sourcePreference(opts) {
    const hasTopic = !!selectedTopic(opts.topic);
    const hasCompany = !!selectedCompany(opts.company);
    const preference = [];
    if (hasTopic && hasCompany) preference.push("combined");
    if (hasCompany) preference.push("company");
    if (hasTopic) preference.push("topic");
    preference.push("type", "resume", "general");
    return preference;
  }

  function takeUnused(list, usedTexts, preferredSources) {
    const candidates = shuffle(list).filter(q => !usedTexts.has(normalize(q.text)));
    if (!preferredSources || !preferredSources.length) return candidates[0] || null;
    for (const source of preferredSources) {
      const match = candidates.find(q => q.source === source);
      if (match) return match;
    }
    return candidates[0] || null;
  }

  function takeForLevel(pool, level, usedTexts, opts) {
    const preferredSources = sourcePreference(opts || {});
    return takeUnused(pool[level], usedTexts, preferredSources) ||
      (level !== "intermediate" ? takeUnused(pool.intermediate, usedTexts, preferredSources) : null) ||
      (level !== "beginner" ? takeUnused(pool.beginner, usedTexts, preferredSources) : null) ||
      takeUnused(pool.advanced, usedTexts, preferredSources);
  }

  function generatedCandidates(opts, level) {
    const ctx = contextLabels(opts || {});
    const companyPart = ctx.company ? ` at ${ctx.companyLabel}` : "";
    const topicPart = ctx.topic ? ` in ${ctx.topicSubject}` : "";
    const templates = {
      beginner: [
        `Tell me about yourself and your interest${topicPart || " in this opportunity"}.`,
        `What motivates you to prepare for a ${ctx.typeLabel} interview${companyPart}?`,
        `Describe one strength that would help you${companyPart}.`,
        `What do you already know about ${ctx.topic ? ctx.topicSubject : ctx.companyLabel}?`,
        "Walk me through your background in a simple, confident way."
      ],
      intermediate: [
        `Tell me about a project or experience that connects to ${ctx.topicSubject}.`,
        `Describe a challenge you faced and how you handled it${companyPart}.`,
        `Give an example of how you used ${ctx.trait} in a real situation.`,
        `Why are you interested in building your career around ${ctx.topicSubject}?`,
        `How would you prepare for a realistic ${ctx.typeLabel} discussion${companyPart}?`,
        "Tell me about feedback you received and how it changed your work."
      ],
      advanced: [
        `What difficult decision might a team face while working on ${ctx.topicSubject}${companyPart}, and how would you approach it?`,
        `How would you balance speed, quality, and ethics in a high-pressure role${companyPart}?`,
        `Where do you see ${ctx.topicSubject} creating important opportunities or risks in the next few years?`,
        `How would you lead people through uncertainty while still showing ${ctx.trait}?`,
        "What would you do if your team disagreed about the best solution to a complex problem?",
        `How would you explain a strategic recommendation about ${ctx.topicSubject} to senior stakeholders?`
      ]
    };
    return (templates[level] || templates.intermediate).map(text => ({
      text,
      topicLabel: ctx.company && ctx.topic ? `${ctx.companyLabel} + ${ctx.topicLabel}` : (ctx.topic ? ctx.topicLabel : ctx.typeLabel),
      difficulty: level,
      source: "generated"
    }));
  }

  function generateFallbackQuestion(opts, level, usedTexts) {
    const levels = [level, "intermediate", "beginner", "advanced"].filter((value, index, arr) => value && arr.indexOf(value) === index);
    for (const candidateLevel of levels) {
      const match = takeUnused(generatedCandidates(opts, candidateLevel), usedTexts, ["generated"]);
      if (match) return match;
    }
    const ctx = contextLabels(opts || {});
    const index = usedTexts.size + 1;
    return {
      text: `Follow-up ${index}: give a specific example that connects your experience with ${ctx.topicSubject}${ctx.company ? ` and ${ctx.companyLabel}` : ""}.`,
      topicLabel: ctx.company && ctx.topic ? `${ctx.companyLabel} + ${ctx.topicLabel}` : ctx.typeLabel,
      difficulty: level || "intermediate",
      source: "generated"
    };
  }

  function buildSession(opts) {
    const duration = Number(opts.duration || 300);
    const count = Math.max(1, countForDuration(duration, opts.count));
    const pool = buildProgressionPool(opts);
    const used = new Set();
    const result = [];

    durationPlan(duration, count).forEach((level) => {
      const q = takeForLevel(pool, level, used, opts);
      if (q) {
        result.push(q);
        used.add(normalize(q.text));
      }
    });

    return result;
  }

  function nextLevelForPerformance(opts) {
    const duration = Number(opts.duration || 300);
    const score = typeof opts.lastScore === "number" ? opts.lastScore : 0;
    const progress = opts.totalCount ? (opts.nextIndex || 0) / opts.totalCount : 0;
    if (duration <= 120) return "beginner";
    if (duration <= 300) return score >= 65 && progress > 0.35 ? "intermediate" : "beginner";
    if (score >= 78 && progress > 0.55) return "advanced";
    if (score >= 58 && progress > 0.25) return "intermediate";
    return "beginner";
  }

  function nextByPerformance(opts) {
    const pool = buildProgressionPool(opts);
    const usedTexts = new Set((opts.usedTexts || []).map(normalize));
    const level = nextLevelForPerformance(opts);
    return takeForLevel(pool, level, usedTexts, opts) || generateFallbackQuestion(opts, level, usedTexts);
  }

  return {
    BASE_QUESTIONS, TOPIC_QUESTIONS, COMPANY_QUESTIONS, BEGINNER_QUESTIONS, INTERMEDIATE_QUESTIONS, ADVANCED_QUESTIONS,
    TOPIC_LABELS, TYPE_LABELS, COMPANY_LABELS, buildSession, nextByPerformance
  };
})();
