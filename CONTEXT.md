<<<<<<< HEAD
# Circlr

A split-screen browser companion that helps a student work through an open document — either completing an assignment or reviewing material — with an AI tutor running alongside.

## Language

**Document**:
The material opened for study — either an assignment or reviewed material. It is not downloaded or uploaded: the Companion reads it from the screen of the page where the student already has it open (e.g. an LMS PDF preview). The left pane of the split view.
_Avoid_: PDF, file, page

**Assignment**:
A document containing questions the student must answer and eventually submit.

**Material**:
A document being reviewed for learning (lecture notes, slides, readings); nothing is submitted.

**Assignment Mode**:
Session mode for an Assignment: the right pane is a Worksheet, and the session ends with a PDF export.

**Review Mode**:
Session mode for Material: the right pane is Notes, and the Tutor runs a Practice Loop over the Material; there is no submission step.
_Avoid_: reviewing mode, note-taking mode

**Practice Loop**:
The Review Mode cycle driven by the Tutor: pose a sample question about the Material, assess the student's attempt, correct wrong assumptions, and generate similar questions until the student answers solidly.

**Worksheet**:
The Assignment-mode right pane: one answer block per question extracted from the Document, each with its own Tutor thread.
_Avoid_: notes (in Assignment Mode), answer sheet

**Notes**:
The Review-mode right pane: the student's outline of the Material, assisted by the Tutor.

**Tutor**:
The Socratic AI assistant. It guides with hints and probing questions and never produces a final answer the student can copy.
_Avoid_: the program, the background process, assistant

**Split View**:
A single browser tab showing two panes side by side: the student's page containing the Document on the left, the right pane (Worksheet or Notes) on the right.

**Capture**:
An event-driven snapshot of the visible Document page (scroll, page change, fallback interval, idle nudge) sent to the vision LLM.

**Mode Picker**:
The fixed two-button choice (Assignment / Review) shown when a Session starts, which sets the mode.

**Export**:
The generated PDF produced at the end of an Assignment Mode session — one question and the student's final answer per block — delivered by drag-dropping onto the LMS's own upload widget, with download as fallback.

**Session**:
One Document opened in the Split View, in exactly one mode, from opening to export or close.
=======
# Circa

Circa watches students work and names the premises they never wrote down. It exists because most lost marks are quiet assumptions, not missing chapters.

## Language

### Findings

**Slip**:
The method was right; the hand leaked — a sign, a copy, a unit.
_Avoid_: careless mistake, silly error

**Hidden Assumption**:
A premise the question never gave, used anyway.
_Avoid_: implicit assumption, unstated given

**Misconception**:
The model in the student's head is wrong, not just messy.
_Avoid_: misunderstanding, weak topic

**Ghost**:
The visible form of one detected Slip or Hidden Assumption — a translucent sticker pinned to the exact step it infected, carrying a type, a severity, and a recurrence count.
_Avoid_: error tag, annotation

**Fingerprint**:
The student's accumulated ghosts across sessions — a profile of how they fail when they think they are succeeding.
_Avoid_: mistakes log, weakness list

### The loop

**Checkpoint**:
A moment Circa is allowed to look at the canvas — pen-up or line-end, never mid-stroke.
_Avoid_: poll, tick

**Intervention Ladder**:
The escalation Circa may climb at a checkpoint: Flag → Hint → Silent → IDK. Each rung is smaller than a solution; none is an answer dump.
_Avoid_: feedback levels

**IDK**:
The student-initiated escape hatch. Returns the smallest unblock aimed at the exact stall point, and is itself logged as a struggle.
_Avoid_: give-up button, hint button

**Autopsy**:
The report after a submission or a live session: every finding pinned to the step where it entered, in the student's language.
_Avoid_: feedback report, grade breakdown

**Practice Mode**:
Working live on the canvas with Circa permitted to speak at checkpoints.
_Avoid_: tutor mode

**Exam Mode**:
Sitting a full paper with Circa silent until submission.
_Avoid_: test mode

**Permission to Speak**:
The single rule that separates the modes — when Circa is allowed to talk: during (Practice) or after (Exam).
_Avoid_: mode setting

**Fading**:
Interventions go silent on ghosts the student has already been caught on — caught live early, confessed only at the autopsy later. Success is interruptions trending to zero.
_Avoid_: difficulty levels
>>>>>>> 2761b10 (Plan)
