import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// ✅ Initialize Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
console.log("Loaded GROQ key:", process.env.GROQ_API_KEY ? "✅ Exists" : "❌ Missing");

// ✅ Multer setup for file uploads
const upload = multer({ dest: "uploads/" });

// --- 🧠 Root Test Route ---
app.get("/", (req, res) => res.send("🧠 Judicio Backend Active"));



// ===================================================
// 🗣️ CHATBOT (Legal Advisor)
// ===================================================
app.post("/chat", async (req, res) => {
  try {
    console.log("🟢 /chat request received:", req.body);

    const prompt = req.body.prompt || req.body.message || "Explain this legal concept simply.";
    if (!prompt) return res.status(400).json({ text: "⚠️ Missing prompt input." });

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant", // ✅ Fast + reasoning capable
      messages: [
        { role: "system", content: "You are Judicio, an AI legal advisor with multilingual support." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    });

    const text = completion?.choices?.[0]?.message?.content?.trim() || "⚠️ No response from Judicio server.";
    res.json({ text });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ text: "⚠️ Could not connect to Judicio server.", error: error.message });
  }
});



// ===================================================
// 📄 DOCUMENT ANALYZER (Multilingual + ML Integration)
// ===================================================
app.post("/api/analyze-document", upload.single("document"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const ext = req.file.originalname.split(".").pop().toLowerCase();
    let text = "";

    // Extract text based on file type
    if (ext === "pdf") {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      text = data.text;
    } else if (ext === "docx") {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    } else if (ext === "txt") {
      text = fs.readFileSync(filePath, "utf-8");
    } else {
      fs.unlinkSync(filePath);
      return res.json({ summary: "⚠️ Unsupported file type." });
    }

    // Clean up file
    fs.unlinkSync(filePath);

    // Multilingual + ML-based summarization
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: `
            You are a multilingual document analysis AI.
            - Detect the document's primary language.
            - Summarize the document in that same language.
            - Identify 3 key legal or business clauses if available.
            - If the document is not legal, summarize its main content.
          `,
        },
        {
          role: "user",
          content: text.substring(0, 8000), // avoid overload
        },
      ],
      temperature: 0.5,
      max_tokens: 1500,
    });

    const response = completion?.choices?.[0]?.message?.content?.trim() || "⚠️ No summary generated.";
    res.json({ language: "Auto-Detected", summary: response });
  } catch (error) {
    console.error("Document analysis error:", error);
    res.status(500).json({ summary: "⚠️ Could not connect to Judicio server.", error: error.message });
  }
});


// ===================================================
// ⚖️ CASE PREDICTOR (with mock fallback)
// ===================================================
app.post("/predict-outcome", async (req, res) => {
  try {
    let { caseType, jurisdiction, summary } = req.body;

    // Provide default mock case if none supplied
    if (!caseType || !jurisdiction || !summary) {
      caseType = "Breach of Contract";
      jurisdiction = "Delhi High Court, India";
      summary =
        "The plaintiff alleges that the defendant failed to deliver goods as per the contract despite multiple reminders. The defendant claims force majeure due to COVID-19 lockdown.";
    }

    const prompt = `
You are Judicio, a multilingual AI legal outcome predictor.
Analyze the following case and respond in this structure:

Outcome: <Predicted verdict or resolution>
Reasoning: <Brief explanation (2-3 sentences)>
Confidence: <Confidence percentage>

Case Type: ${caseType}
Jurisdiction: ${jurisdiction}
Case Summary: ${summary}
    `;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "You are Judicio, an expert AI legal advisor trained to predict outcomes based on jurisdiction and facts.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      max_tokens: 512,
    });

    const text = completion?.choices?.[0]?.message?.content?.trim() || "⚠️ No prediction generated.";

    const outcome = text.match(/Outcome[:\-]\s*(.*)/i)?.[1]?.trim() || "No clear outcome.";
    const reasoning = text.match(/Reasoning[:\-]\s*([\s\S]*?)(?:Confidence[:\-]|$)/i)?.[1]?.trim() || "No reasoning found.";
    const confidence = text.match(/Confidence[:\-]\s*(.*)/i)?.[1]?.trim() || "Unknown";

    res.json({ outcome, reasoning, confidence });
  } catch (error) {
    console.error("Prediction error:", error.response?.data || error.message);
    res.status(500).json({
      outcome: "⚠️ Could not connect to Judicio server.",
      reasoning: "",
      confidence: "",
    });
  }
});
// ===================================================
// 🕒 CASE TIMELINE (with default example)
// ===================================================
app.post("/generate-timeline", async (req, res) => {
  try {
    let { caseFacts } = req.body;

    if (!caseFacts || caseFacts.trim() === "") {
      caseFacts = `
15 जनवरी 2020 - वादी और प्रतिवादी के बीच सप्लाई एग्रीमेंट पर हस्ताक्षर हुए।
10 फरवरी 2020 - माल की पहली खेप समय पर भेजी गई।
25 मार्च 2020 - COVID-19 लॉकडाउन के कारण सप्लाई बाधित।
15 अप्रैल 2020 - वादी ने नोटिस भेजा।
10 मई 2020 - प्रतिवादी ने जवाब दिया कि स्थिति "force majeure" के तहत थी।
1 जून 2020 - वादी ने अनुबंध उल्लंघन के लिए मुकदमा दायर किया।
      `;
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "You are a multilingual AI case timeline generator. Extract all chronological events in 'Date - Event' format, translating Hindi dates/events to English if necessary.",
        },
        { role: "user", content: caseFacts },
      ],
      temperature: 0.5,
      max_tokens: 600,
    });

    const text = completion?.choices?.[0]?.message?.content?.trim() || "⚠️ No timeline generated.";
    const lines = text
      .split(/\n+/)
      .filter((line) => line.trim())
      .map((line) => {
        const match = line.match(/^(.*?)[–\-:]\s*(.*)$/);
        return match
          ? { date: match[1].trim(), event: match[2].trim() }
          : { date: "—", event: line.trim() };
      });

    res.json(lines.length ? lines : [{ date: "—", event: text }]);
  } catch (error) {
    console.error("Timeline generation error:", error);
    res.status(500).json([{ date: "Error", event: "⚠️ Could not generate timeline." }]);
  }
});

// ===================================================
// ⚔️ ARGUMENT STRATEGIST (with mock case)
// ===================================================
app.post("/generate-arguments", async (req, res) => {
  try {
    let { coreArgument, argumentType } = req.body;

    if (!coreArgument) {
      coreArgument =
        "The defendant claims that due to the COVID-19 lockdown, the non-delivery of goods falls under the force majeure clause.";
      argumentType = "for";
    }

    const prompt = `
You are Judicio, a multilingual AI legal strategist.
Generate 3 structured legal arguments ${
      argumentType === "against" ? "against" : "in favor of"
    } the following statement.
For each argument, include:

Argument: <Title>
Analysis: <Brief reasoning>
Strategy: <Counter or suggested approach>

Statement: ${coreArgument}
`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are Judicio, an AI legal strategist with multilingual reasoning." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    const response = completion?.choices?.[0]?.message?.content?.trim() || "⚠️ No arguments generated.";

    const argumentBlocks = response
      .split(/Argument[:\-]/i)
      .filter((b) => b.trim())
      .map((block) => {
        const analysisMatch = block.match(/Analysis[:\-]\s*([\s\S]*?)(Strategy[:\-]|$)/i);
        const strategyMatch = block.match(/Strategy[:\-]\s*([\s\S]*)/i);
        const title = block.split("\n")[0].trim();
        return {
          argument: title || "Untitled Argument",
          analysis: analysisMatch ? analysisMatch[1].trim() : "No analysis provided.",
          response: strategyMatch ? strategyMatch[1].trim() : "No strategy provided.",
        };
      });

    res.json(argumentBlocks);
  } catch (error) {
    console.error("Argument generation error:", error.response?.data || error.message);
    res.status(500).json([{ argument: "⚠️ Could not connect to Judicio server." }]);
  }
});



// ===================================================
// 🚀 Start Server
// ===================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Judicio backend running at http://localhost:${PORT}`));
