import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Gemini Client safely
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY is not defined. Using mock response / placeholder evaluation.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "MOCK_KEY",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

const app = express();
app.use(express.json());

const PORT = 3000;

// Standard sample Cue Cards just in case or for offline
const CUE_CARDS = [
  {
    topic: "Describe a beautiful city you visited which you would like to recommend to others",
    bullets: [
      "Where this city is",
      "When you went there",
      "What you did there",
      "And explain why you would recommend this city to others"
    ]
  },
  {
    topic: "Describe a book you read recently that you found fascinating",
    bullets: [
      "What the book is",
      "What it is about",
      "Why you decided to read it",
      "And explain why you found it fascinating"
    ]
  },
  {
    topic: "Describe a useful skill you learned recently that changed your life",
    bullets: [
      "What the skill is",
      "How and where you learned it",
      "How long it took to learn",
      "And explain how this skill changed or improved your life"
    ]
  },
  {
    topic: "Describe a time when you had to solve an interesting problem",
    bullets: [
      "What the problem was",
      "How you chose to solve it",
      "Who helped you solve it",
      "And explain why this was an interesting problem to solve"
    ]
  }
];

// POST /api/interview/chat
app.post("/api/interview/chat", async (req, res) => {
  try {
    const { stage, candidateName, questionCount, history, cueCard, part2Duration } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Return a professional mock interview flow if API key is not configured yet
      return handleMockInterviewFlow(req.body, res);
    }

    const ai = getAI();

    // Setup detailed Prompt to guide Emily's IELTS Examiner Persona
    const systemPrompt = `
You are Emily, a highly professional, senior IELTS Speaking Examiner from the UK.
Your tone is standard British, ultra-polite, formal, absolutely objective, and concise. Do NOT give long, conversational chit-chat; you must strictly match the real IELTS examiner timing and conciseness.
Your primary objective is to evaluate the candidate's English and proceed through the standard IELTS 4-step interview process:
1. "self_introduction": Ask candidate for introduction (name, target score, or why they are taking the exam). Keep it warm but brief.
2. "part1": Conduct Part 1. Ask 3 daily life questions (topics like sports, hometown, hobbies, or digital habits). Ask them one-by-one. When questionCount reaches 3, transition to part2.
3. "part2": Present a custom Cue Card with topics and bullets. Realize that prompt is being given. Give them details and explain they have 1 minute to plan and 1-2 minutes to talk. Only present the cue card now, do not ask a secondary question. In the candidate's next message, they will provide their 1-2 minutes answer.
4. "part3": Part 3. Conduct in-depth discussions based on the Cue Card topic. Ask 2 abstract, deeper questions one-by-one.
5. "evaluation": Final score report. Calculate official bands (1.0 to 9.0 in 0.5 steps) across 4 dimensions: Fluency & Coherence, Lexical Resource, Grammatical Range, Pronunciation, and calculate an overall band score. Give advice of maximum 20 words for each criteria as per strict IELTS rubric. Also provide immediate corrections in English.

CONTEXT OF CURRENT DIALOGUE:
- Candidate Name: ${candidateName || 'Candidate'}
- Current Stage: ${stage}
- Current Question Count in this part: ${questionCount}
- Part 2 Response Duration: ${part2Duration || 0} seconds matches the answer length (Part 2 requires at least 60 seconds. If user spoke for < 60 seconds, Emily MUST tell them they spoke too briefly and encourage them to continue during part2).

IMPORTANT ASSIGNMENT:
1. Examine the candidate's last message carefully for ANY grammatical weaknesses, tense discrepancies (e.g. mixup of past/present simple), inappropriate vocabulary, plain/simplistic structures, or awkward collocations. 
Aim to provide 1 to 4 precise corrections. Even if the sentence is technically correct, suggest a more natural/idiomatic IELTS Band 8.0-9.0 alternative phrase under 'corrected' and highlight their plain/clunky input under 'original'.
This is critical for the candidate to see in red so they can improve. Keep the corrective explanation ultra-brief (under 15 words).
2. Formulate your speaking response ('emilySpeech') as Emily. Maintain the strict formal demeanor, UK English spelling, and style.
`;

    const chatContent = history.map((m: any) => {
      const roleName = m.role === 'emily' ? 'model' : 'user';
      return `${roleName === 'model' ? 'Emily' : 'Candidate'}: ${m.text}`;
    }).join("\n");

    const promptText = `
Given the history:
${chatContent}

Please generate the examiner's next action. Remember:
- If we are transitioning from setup/self_introduction, nextStage should be 'part1' and questionCount starts at 1. Ask the very first Part 1 question.
- If in 'part1' and questionCount < 3, nextStage remains 'part1', increment questionCount, and ask the next simple daily question.
- If in 'part1' and questionCount equal to 3, nextStage should become 'part2', and select or generate a great IELTS Cue Card under 'cueCard' (e.g. topic: "Describe...", bullets: ["...", "..."]). Prepare the cue card response.
- If in 'part2' and user has just answered, nextStage should transition to 'part3', set questionCount to 1, and ask the first deeper abstract question related to the part 2 topic. BUT, if part2Duration is < 60, nextStage remains 'part2', cueCard remains valid, and you must explicitly prompt the candidate to keep speaking about this topic for a little longer.
- If in 'part3' and questionCount < 2, nextStage remains 'part3', increment questionCount and ask the final deep abstract question.
- If in 'part3' and questionCount equal to 2, or if candidate asks to finish, nextStage should become 'evaluation' and you MUST populate the 'evaluation' field with strict, genuine IELTS scores (1.0 to 9.0) and 20-word improvement advices.

Generate the output JSON strictly according to the specified schema.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { text: systemPrompt },
        { text: promptText }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            emilySpeech: { 
              type: Type.STRING, 
              description: "Emily's concise response/speech in authentic British English. Make sure to follow the stage protocols." 
            },
            corrections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING, description: "The exact incorrect phrase or words spoken by the user." },
                  corrected: { type: Type.STRING, description: "The natural, grammatically correct and authentic English version." },
                  explanation: { type: Type.STRING, description: "Short explanation why the error occurred, in simple English (max 15 words)." }
                }
              },
              description: "List of precise grammatical, formatting, or word-choice errors found specifically in the user's last speaker turn."
            },
            nextStage: { 
              type: Type.STRING, 
              description: "Determine the stage for the next turn: self_introduction, part1, part2, part3, evaluation." 
            },
            questionCount: { 
              type: Type.INTEGER, 
              description: "The updated counter for questions asked in Part 1 or Part 3." 
            },
            cueCard: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING, description: "The title of the cue card. e.g. Describe an old person you admire." },
                bullets: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "3 to 4 points that the candidate should cover."
                }
              },
              description: "Pass a cue card object only when transitioning into part2. Otherwise leave null."
            },
            evaluation: {
              type: Type.OBJECT,
              properties: {
                overallBand: { type: Type.NUMBER, description: "Overall IELTS band score from 1.0 to 9.0" },
                fluency: {
                  type: Type.OBJECT,
                  properties: {
                    score: { type: Type.NUMBER },
                    advice: { type: Type.STRING, description: "Maximum 20 words diagnostic improvement tip." }
                  }
                },
                vocabulary: {
                  type: Type.OBJECT,
                  properties: {
                    score: { type: Type.NUMBER },
                    advice: { type: Type.STRING, description: "Maximum 20 words diagnostic improvement tip." }
                  }
                },
                grammar: {
                  type: Type.OBJECT,
                  properties: {
                    score: { type: Type.NUMBER },
                    advice: { type: Type.STRING, description: "Maximum 20 words diagnostic improvement tip." }
                  }
                },
                pronunciation: {
                  type: Type.OBJECT,
                  properties: {
                    score: { type: Type.NUMBER },
                    advice: { type: Type.STRING, description: "Maximum 20 words diagnostic improvement tip." }
                  }
                },
                globalAdvice: { type: Type.STRING, description: "Global advice summing up everything in max 35 words." }
              },
              description: "Provide comprehensive grading only if nextStage is evaluation."
            }
          }
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    res.json(data);

  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    res.status(500).json({ 
      error: "Failed to communicate with IELTS Emily. Please try again.",
      message: error.message 
    });
  }
});

// Fallback logic when GEMINI_API_KEY is not defined, ensuring offline mock test runs impeccably
function handleMockInterviewFlow(body: any, res: any) {
  const { stage, questionCount, history, part2Duration } = body;
  const lastMsg = history[history.length - 1]?.text || "";

  // Perform a small regex-based quick check to make some sample red-corrections to show off features!
  const corrections: any[] = [];
  if (lastMsg.toLowerCase().includes("i is") || lastMsg.toLowerCase().includes("i am come")) {
    corrections.push({
      original: "i is / i am come",
      corrected: "I am",
      explanation: "Incorrect auxiliary verb. Use 'I am'."
    });
  }
  if (lastMsg.toLowerCase().includes("more better")) {
    corrections.push({
      original: "more better",
      corrected: "much better / better",
      explanation: "Double comparative error. 'Better' is already comparative."
    });
  }
  if (lastMsg.toLowerCase().includes("peoples")) {
    corrections.push({
      original: "peoples",
      corrected: "people",
      explanation: "People is already irregular plural."
    });
  }
  if (lastMsg.toLowerCase().includes("agree with you") && !lastMsg.toLowerCase().includes("i agree")) {
    // example
  }

  let emilySpeech = "";
  let nextStage = stage;
  let nextCount = questionCount;
  let cueCard = null;
  let evaluation = null;

  if (stage === "self_introduction") {
    nextStage = "part1";
    nextCount = 1;
    emilySpeech = "Thank you for the introduction. Let's move on to Part 1. Firstly, I'd like to ask you: Do you prefer studying in the morning or in the evening? Why?";
  } else if (stage === "part1") {
    if (questionCount === 1) {
      nextCount = 2;
      emilySpeech = "Excellent. Now, let's talk about sports. What kind of sports are popular in your hometown, and do you play any?";
    } else if (questionCount === 2) {
      nextCount = 3;
      emilySpeech = "I see. And our third daily question: How often do you use social media apps, and do you feel they are beneficial to your daily routine?";
    } else {
      nextStage = "part2";
      nextCount = 0;
      const selectCard = CUE_CARDS[Math.floor(Math.random() * CUE_CARDS.length)];
      cueCard = selectCard;
      emilySpeech = `Perfect. That is the end of Part 1. Let's transition to Part 2. I am going to give you a topic card. I would like you to speak about it for 1 to 2 minutes. Before you start speaking, you have 1 minute to make notes. Here is your cue card topic:\n\n"${selectCard.topic}".\n\nYou may begin your preparation now.`;
    }
  } else if (stage === "part2") {
    if (part2Duration < 60) {
      emilySpeech = `You have only spoken for ${part2Duration} seconds. In the real IELTS exam, you must speak for at least 1 to 2 minutes during Part 2. Please continue elaborate on the points mentioned in the Cue Card.`;
      nextStage = "part2";
    } else {
      nextStage = "part3";
      nextCount = 1;
      emilySpeech = "Thank you very much. That was a detailed Part 2 response. Let's move on to Part 3 where we discuss related abstract ideas. Why do you think people nowadays have less time to read books or enjoy cultural sites than in past generations?";
    }
  } else if (stage === "part3") {
    if (questionCount === 1) {
      nextCount = 2;
      emilySpeech = "That is an interesting perspective. Do you believe that technology or digital media will completely eliminate traditional ways of physical interactions in the future?";
    } else {
      nextStage = "evaluation";
      emilySpeech = "Thank you. That brings us to the end of your speaking mock interview. I will now compile your IELTS Band evaluation.";
      evaluation = {
        overallBand: 7.0,
        fluency: { score: 7.0, advice: "Work on keeping speech rate continuous and reduce hesitation pauses." },
        vocabulary: { score: 7.5, advice: "Utilize more idiomatic pairings and less repetitive descriptors." },
        grammar: { score: 6.5, advice: "Ensure perfect agreement of tense in complex sentences." },
        pronunciation: { score: 7.0, advice: "Concentrate on clear word stress patterns and vowel sounds." },
        globalAdvice: "You performed well! Focus on consistency in past tense grammar and speak dynamically with clear linkers."
      };
    }
  }

  res.json({
    emilySpeech,
    corrections,
    nextStage,
    questionCount: nextCount,
    cueCard,
    evaluation
  });
}

// Vite and static asset configuration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server running on http://localhost:${PORT}`);
  });
}

startServer();
