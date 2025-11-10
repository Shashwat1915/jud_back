import fs from "fs";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import path from "path";

/**
 * Extracts readable text from PDFs, DOCX, and TXT files.
 * Automatically detects and cleans multilingual content.
 */
export async function extractText(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".pdf") {
      const buffer = fs.readFileSync(filePath);
      const data = await pdf(buffer);
      return data.text.trim() || "⚠️ No text detected in PDF.";
    }

    if (ext === ".docx") {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value.trim() || "⚠️ No text detected in DOCX.";
    }

    if (ext === ".txt") {
      const text = fs.readFileSync(filePath, "utf8");
      return text.trim() || "⚠️ Empty TXT file.";
    }

    return "⚠️ Unsupported file type. Please upload a PDF, DOCX, or TXT document.";
  } catch (err) {
    console.error("❌ Error reading document:", err);
    return "⚠️ Error reading document. Please try again.";
  } finally {
    // optional cleanup (remove uploaded file)
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}
