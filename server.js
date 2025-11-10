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
// ⚖️ CASE PREDICTOR
// ===================================================
app.post("/predict-outcome", async (req, res) => {
  const { caseType, jurisdiction, summary } = req.body;
  if (!caseType || !jurisdiction || !summary) {
    return res.status(400).json({
      outcome: "⚠️ Missing required fields.",
      reasoning: "",
      confidence: "",
    });
  }

  try {
    const prompt = `
    You are a legal outcome predictor.
    Analyze this case and respond in the following structure:

    Outcome: <Predicted verdict or result>
    Reasoning: <Brief explanation in 3 sentences>
    Confidence: <Confidence percentage>

    Case Type: ${caseType}
    Jurisdiction: ${jurisdiction}
    Summary: ${summary}
    `;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are an expert legal AI predicting outcomes based on evidence and precedent." },
        { role: "user", content: prompt },
      ],
    });

    const text = completion?.choices?.[0]?.message?.content || "";
    const outcome = text.match(/Outcome[:\-]\s*(.*)/i)?.[1]?.trim() || "No clear outcome.";
    const reasoning = text.match(/Reasoning[:\-]\s*([\s\S]*?)(?:Confidence[:\-]|$)/i)?.[1]?.trim() || "No reasoning found.";
    const confidence = text.match(/Confidence[:\-]\s*(.*)/i)?.[1]?.trim() || "Unknown";

    res.json({ outcome, reasoning, confidence });
  } catch (error) {
    console.error("Prediction error:", error);
    res.status(500).json({ outcome: "⚠️ Could not connect to Judicio server.", reasoning: "", confidence: "" });
  }
});

// ===================================================
// 📜 CASE TIMELINE
// ===================================================
app.post("/generate-timeline", async (req, res) => {
  try {
    const { prompt } = req.body;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are a legal case timeline generator." },
        { role: "user", content: `Organize these facts into a chronological timeline:\n${prompt}` },
      ],
    });

    const text = completion?.choices?.[0]?.message?.content || "⚠️ No timeline generated.";
    const lines = text.split("\n").filter((l) => l.trim()).map((line) => {
      const [date, ...rest] = line.split(/[-–:]/);
      return { date: date.trim(), event: rest.join(" ").trim() };
    });

    res.json(lines);
  } catch (error) {
    console.error("Timeline generation error:", error);
    res.status(500).json([{ date: "Error", event: "⚠️ Could not generate timeline." }]);
  }
});

// ===================================================
// ⚔️ ARGUMENT STRATEGIST
// ===================================================
app.post("/generate-arguments", async (req, res) => {
  try {
    const { coreArgument, argumentType } = req.body;
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "You are a legal strategist AI generating strong legal arguments.",
        },
        {
          role: "user",
          content: `Generate 3 arguments ${argumentType} the statement below with analysis and counter-strategy:\n\n${coreArgument}`,
        },
      ],
    });

    const response = completion?.choices?.[0]?.message?.content || "";
    const argumentBlocks = response.split(/Argument[:\-]/i).filter((b) => b.trim()).map((block) => {
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
    console.error("Argument generation error:", error);
    res.status(500).json([{ argument: "⚠️ Could not connect to Judicio server." }]);
  }
});

// ===================================================
// 🚀 Start Server
// ===================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Judicio backend running at http://localhost:${PORT}`));
