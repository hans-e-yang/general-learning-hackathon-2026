# Read documents by capturing the screen with a vision LLM

The Companion never downloads or asks the student to upload the assignment or material file. The Chrome extension captures what is already on screen — the student's open document in an LMS PDF preview (e.g. Canvas) — and a vision LLM reads questions and material from those captures.

Considered alternatives: pdf.js text extraction (fails on scans and slide exports, and can't see an LMS-rendered viewer) and downloading/parsing the file (fragile auth around LMS resources, extra UX steps). Vision-on-screen was chosen because the demo environment is LMS web previews and it makes PPT and scanned documents work for free. Trade-off accepted: higher token cost and rendering/capture work per page.
