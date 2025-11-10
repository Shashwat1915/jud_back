// backend/routes/analyzeDocumentRoute.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { Groq } from "groq-sdk";
import { extractText } from "../utils/extractText.js";

const router = express.Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// File upload setup
const upload = multer({ dest: "uploads/" });

router.post("/", upload.single("document"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const rawText = await extractText(filePath);

    if (!rawText.trim()) {
      return res.status(400).json({ error: "No text found in document." });
    }

    const prompt = `
You are a multilingual legal document analyzer.
Detect the document language, summarize key points, and list major clauses.
Provide output in both the original language and English.
Document:
${rawText.slice(0, 4000)}
`;

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
    });

    const result = response.choices[0]?.message?.content || "⚠️ No output from model.";

    fs.unlinkSync(filePath);

    res.json({ summary: result, language: "Auto-Detected", clauses: [] });
  } catch (error) {
    console.error("❌ Error in /analyze-document:", error);
    res.status(500).json({ error: "Failed to analyze document." });
  }
});

export default router;
