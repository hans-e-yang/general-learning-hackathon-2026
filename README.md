# Circlr

Split-screen browser study companion: the Chrome extension live-reads the document already open on your screen (any webpage, no downloads), and a Next.js companion pane coaches you through it — Socratically, never printing answers for you.

- Scope of the first build: [spec issue #2](https://github.com/hans-e-yang/general-learning-hackathon-2026/issues/2)
- Domain vocabulary: `CONTEXT.md`
- Ingestion decision: `docs/adr/0001-vision-llm-screen-reading.md`
- Lane B (backend) flow + contracts: `docs/agentic-loop.md`

## Agent-loop extensions (Lane B)

Two agent-loop extensions are implemented. Contract details live in
`docs/agentic-loop.md` §12; tickets are `lane:backend`.

- **Capture triage (#28):** every accepted capture is first judged by a small
  vision agent that decides whether the screen carries new information worth
  folding into the session context, instead of running extraction on every
  non-deduped frame. The watcher still runs each accepted capture.
- **Scout-first assessment with Tutor escalation (#29):** the frontend can
  trigger Scout on a draft, and the Tutor only speaks when Scout's verdict says
  the draft needs it — distinct from the passive tick on save.

## Deferred concern: the Practice Loop (do not forget)

Review Mode's Tutor behavior was designed but **deliberately cut** from the first build (24-hour hackathon scope): the Tutor poses sample questions about the material, assesses the student's attempt, corrects wrong assumptions, and generates similar questions until the student answers solidly. `CONTEXT.md` already names the concept. It is the next concern to build after the Assignment Mode core ships.

## Deferred concern: Exported Board crops (after demo)

Board marks attaching to the Export PDF were designed but **deliberately cut** this cycle — the Export stays text-only per Worksheet block. Crop attachment is the next Export concern after the demo.
