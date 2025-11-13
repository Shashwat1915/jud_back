// =========================================
// 🚀 JUDICIO BACKEND (ML + GROQ HYBRID)
// =========================================
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

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ================================
// 🔥 ML MODEL (YOUR PYTHON MODEL) 
// ================================
import { spawn } from "child_process";

// Call python ML model to extract clauses
function runMLModel(text) {
  return new Promise((resolve) => {
    const python = spawn("python", ["ml_classifier.py"]); // <- your python file

    let output = "";
    python.stdin.write(text);
    python.stdin.end();

    python.stdout.on("data", (data) => (output += data.toString()));
    python.on("close", () => {
      try {
        resolve(JSON.parse(output));
      } catch {
        resolve({ clauses: [] });
      }
    });
  });
}

// ================================
// 📁 File Upload Setup
// ================================
const upload = multer({ dest: "uploads/" });

// ================================
// 🧠 Test Route
// ================================
app.get("/", (req, res) => res.send("JUDICIO Backend Running 🚀"));


// =========================================
// 🗣️ CHATBOT
// =========================================
app.post("/chat", async (req, res) => {
  try {
    const prompt = req.body.message;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are Judicio, an AI legal assistant." },
        { role: "user", content: prompt },
      ]
    });

    res.json({
      text: completion.choices[0].message.content.trim()
    });

  } catch (err) {
    res.json({ text: "⚠️ Could not connect to server." });
  }
});


// =========================================
// 📄 DOCUMENT ANALYZER (ML + LLM Hybrid)
// =========================================
app.post("/api/analyze-document", upload.single("document"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const ext = req.file.originalname.split(".").pop().toLowerCase();

    let text = "";

    // ---- Extract Text ----
    if (ext === "pdf") {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      text = data.text;
    } else if (ext === "docx") {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    } else if (ext === "txt") {
      text = fs.readFileSync(filePath, "utf8");
    }

    fs.unlinkSync(filePath); // cleanup


    // ================================
    // 🧠 1) RUN YOUR ML MODEL
    // ================================
    const mlResult = await runMLModel(text);
    const classifiedClauses = mlResult.clauses || [];


    // ================================
    // 🤖 2) RUN GROQ LLM SUMMARY
    // ================================
    const llm = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "You are an AI legal document analyzer. Detect language, summarize the document, and provide legal insights."
        },
        { role: "user", content: text.substring(0, 7000) }
      ],
      temperature: 0.4
    });

    const summaryText = llm.choices[0].message.content.trim();

    res.json({
      language: "Auto-Detected",
      summary: summaryText,
      ml_clauses: classifiedClauses
    });

  } catch (err) {
    res.status(500).json({
      summary: "⚠️ Unable to analyze document.",
      ml_clauses: []
    });
  }
});


// =========================================
// ⚖️ CASE PREDICTOR
// =========================================
app.post("/predict-outcome", async (req, res) => {
  try {
    const { caseType, jurisdiction, summary } = req.body;

    const prompt = `
Case Type: ${caseType}
Jurisdiction: ${jurisdiction}
Summary: ${summary}
Generate:
Outcome:
Reasoning:
Confidence:
    `;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "Predict legal outcomes based on facts." },
        { role: "user", content: prompt },
      ]
    });

    const text = completion.choices[0].message.content.trim();

    res.json({
      outcome: text.match(/Outcome[:\-]\s*(.*)/)?.[1] || "",
      reasoning: text.match(/Reasoning[:\-]\s*(.*)/)?.[1] || "",
      confidence: text.match(/Confidence[:\-]\s*(.*)/)?.[1] || ""
    });

  } catch {
    res.json({
      outcome: "⚠️ Server error",
      reasoning: "",
      confidence: ""
    });
  }
});


// =========================================
// 🕒 TIMELINE GENERATOR
// =========================================
app.post("/generate-timeline", async (req, res) => {
  try {
    const { caseFacts } = req.body;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "Extract chronological legal events in 'Date - Event' format."
        },
        { role: "user", content: caseFacts }
      ]
    });

    const lines = completion.choices[0].message.content
      .trim()
      .split("\n")
      .map((l) => {
        const [date, event] = l.split(/[-–—:]/);
        return { date: date?.trim(), event: event?.trim() };
      });

    res.json(lines);

  } catch {
    res.json([{ date: "Error", event: "Timeline generation failed" }]);
  }
});


// =========================================
// ⚔️ ARGUMENT STRATEGY
// =========================================
app.post("/generate-arguments", async (req, res) => {
  try {
    const { coreArgument, argumentType } = req.body;

    const prompt = `
Generate 3 legal arguments ${argumentType} the statement:
${coreArgument}
Format:
Argument:
Analysis:
Strategy:
    `;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You generate legal arguments." },
        { role: "user", content: prompt }
      ]
    });

    const blocks = completion.choices[0].message.content
      .split("Argument:")
      .slice(1)
      .map((b) => ({
        argument: b.split("Analysis:")[0].trim(),
        analysis: b.split("Analysis:")[1]?.split("Strategy:")[0]?.trim(),
        strategy: b.split("Strategy:")[1]?.trim()
      }));

    res.json(blocks);

  } catch {
    res.json([{ argument: "⚠️ Server unreachable" }]);
  }
});


// =========================================
// 🚀 START SERVER
// =========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 JUDICIO backend running on http://localhost:${PORT}`)
);
