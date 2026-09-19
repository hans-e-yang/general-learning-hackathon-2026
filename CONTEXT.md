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
The student's page containing the Document with the Companion pane beside it — on desktop, the Companion in the browser side panel; on tablets, the Companion PWA placed beside the browser via the OS's own split screen. Two panes: Document left, Companion right.

**Capture**:
A periodic snapshot of the visible Document page (the active tab, `captureVisibleTab`), taken every few seconds; near-duplicates are dropped by average-hash distance before it is sent to the vision LLM.

**Mode Picker**:
The fixed two-button choice (Assignment / Review) shown when a Session starts, which sets the mode.

**Export**:
The generated PDF produced at the end of an Assignment Mode session — one question and the student's final answer per block — delivered by drag-dropping onto the LMS's own upload widget, with download as fallback.

**Session**:
One Document opened in the Split View, in exactly one mode, from opening to export or close.

**Board**:
The single shared canvas for a whole Session: a freehand whiteboard (pen strokes, eraser, text) that the student and the Tutor both mark. The Tutor's marks are suggested annotations (arrows, circles) and remain visually distinguished from the student's. The Board never contains a final answer written by the Tutor.
_Avoid_: canvas, jamboard, whiteboard app
