# Circlr

Split-screen browser study companion: the Chrome extension live-reads the document already open on your screen (any webpage, no downloads), and a Next.js companion pane coaches you through it — Socratically, never printing answers for you.

- Scope of the first build: [spec issue #2](https://github.com/hans-e-yang/general-learning-hackathon-2026/issues/2)
- Domain vocabulary: `CONTEXT.md`
- Ingestion decision: `docs/adr/0001-vision-llm-screen-reading.md`
- Lane B (backend) flow + contracts: `docs/agentic-loop.md`

## Deferred concern: the Practice Loop (do not forget)

Review Mode's Tutor behavior was designed but **deliberately cut** from the first build (24-hour hackathon scope): the Tutor poses sample questions about the material, assesses the student's attempt, corrects wrong assumptions, and generates similar questions until the student answers solidly. `CONTEXT.md` already names the concept. It is the next concern to build after the Assignment Mode core ships.
