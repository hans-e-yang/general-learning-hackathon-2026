# Circa

**Catch the quiet error.**

Circa is a study engine for the **Automate Studies** track at [General Learning Hacks](https://general-learning-hacks.devpost.com/). It is built for the mistakes that never show up as “I don’t know this topic” — the dropped negative, the domain you treated as always true, the formula you applied one step too early.

Most tools mark the final answer. Circa marks the **moment your reasoning quietly assumed something that was not given.**

---

## The problem

In an exam, a lot of lost marks are not ignorance. They are **tiny carelessness** and **implicit assumptions**:

- You cancelled a factor without checking it was non-zero.
- You treated acceleration as constant because the last question was.
- You copied the diagram’s “looks isosceles” instead of proving it.
- You used the calculator value of *g* in a paper that wanted *g = 10*.
- You were sure you understood the method. You just leaked a hidden `if`.

In practice, the same thing happens. You finish a past paper, see a red X, and restudy the *chapter* — not the *assumption* that actually caused the miss. Next paper, same miss, new numbers.

Circa exists so students can submit **anything they already do** — homework, assignments, drills, past papers — and get back the error they did not know they made.

---

## What Circa is

A two-mode loop:

1. **You work in your own knowledge.** No answer dump before you try.
2. **Circa finds the quiet error** — misconception, slip, or hidden assumption.
3. **Practice Mode walks the method step by step** until the same trap cannot fire again.
4. **Exam Mode autopsies a full submission**, then turns those fingerprints into a study path and a schedule.

The unit of learning is not “Chapter 4.” It is **this assumption, in your handwriting, on this kind of item.**

---

## Two modes

### 1. Practice Mode — circle to practice

Upload notes, a slide, a worksheet, or a single question. **Circle the region you want to own** — a formula, a diagram, a mark-scheme line, a paragraph you keep misreading.

Circa then:

- Generates a short drill from *that* circled patch, not the whole chapter.
- Watches *how* you solve, not only whether the box is right.
- Stops you at the first hidden assumption (“you treated the root as principal without stating it”).
- Unlocks the next step only after you attempt the current one.
- Replays the correct method as a sequence of **required moves**, so “I kind of get it” cannot hide.

Circle → attempt → get caught → retry the same trap in a new skin.

This is the daily loop.

### 2. Exam Mode — do everything, then submit

This is the “I sat the paper” version.

Upload the **question paper + your answers** (photo, PDF, or typed). Circa grades the set as a whole and returns an **exam autopsy**:

| Finding | Meaning |
| --- | --- |
| Slip | You knew the method. A small execution leak (sign, copy, unit). |
| Hidden assumption | A premise that was never in the question, but you used it anyway. |
| Misconception | The model in your head is wrong, not just messy. |
| Clean | Method and premises both hold. |

Each miss is pinned back onto the paper: *this line is where the quiet error entered.* You get feedback in the student’s language (“you assumed the particle started from rest”) instead of a topic tag (“kinematics”).

From one submission, Circa updates your **error fingerprint** and proposes what to circle next in Practice Mode.

---

## Creative layer: Assumption Ghosts

Wrong answers are loud. Assumptions are quiet. Circa makes them visible.

Every detected premise is drawn as a **ghost** on the page — a translucent sticker sitting on the exact step it infected:

> Ghost: “You used `x > 0` here. The question never said that.”

Ghosts have a type, a severity, and a recurrence count. If the same ghost shows up on homework, then a past paper, then a mock, it graduates from “one careless moment” to **your signature error**.

That fingerprint is the product:

- A profile of *how you fail* when you think you are succeeding.
- A replay: scrub backward through your solution until the ghost appears.
- A kill condition: the ghost is not “reviewed.” It is **extinct** only after you survive it in Practice Mode, on a transfer item, without Circa prompting the premise.

This is what we show in the 2-minute demo: a paper that looks almost right, then the ghosts turn on.

---

## After the mark: feedback, path, schedule

Exam Mode is not a score. It is a state update.

1. **Feedback** — per question, the class of error, the ghost, and one counter-example where that assumption dies.
2. **Progress** — a map of skills vs ghosts. Green means the method is stable. Amber means the method works until a known trap. Red means the trap still owns you.
3. **Study path** — ordered circles. Circa does not say “revise trigonometry.” It says “circle the identities you keep applying to the non-acute case, then sit three transfer items.”
4. **Scheduler** — the same ghost is brought back on an expanding interval until it stays dead. High-recurrence assumptions jump the queue before the next mock.

Practice Mode is how you serve the path. Exam Mode is how you prove it.

---

## Why this is not another AI marker

Jojo and ChatGPT can already tell you the right working. Students already use them, and a large share still cannot finish work without them. Circa is built on the opposite rule:

- **You answer first.** Reveal stays locked until there is an attempt.
- **We classify the miss**, not paraphrase the mark scheme.
- **We route the next circle from your ghosts**, not from a generic weak-topic list.
- **We keep the target cognition** — retrieval, explanation, transfer — on the student.

If Circa ever dumps a full worked solution before you have tried, it is broken.

---

## Demo story (2 minutes)

1. A student submits a mechanics past paper. Score looks fine except two “careless” marks.
2. Ghosts on: *assumed u = 0*, *cancelled (x − 2) without stating x ≠ 2*.
3. Flip to Practice Mode. Circa has already circled those two patches.
4. Guided steps; Reveal locked; a transfer item with different numbers.
5. Scheduler: those two ghosts return in 1 day and 3 days. The rest of the paper does not get restudied.

The punchline: **the student did not lack the chapter. They lacked a witness for the assumption.**

---

## Product loop

```
anything you already do
        │
        ├── circle a patch ──────────────► Practice Mode (guided steps)
        │                                      │
        └── submit the whole paper ──────► Exam Mode (autopsy)
                                               │
                                               ▼
                                    error fingerprint (ghosts)
                                               │
                                               ▼
                                    path + spaced scheduler
                                               │
                                               └── circles the next trap
```

---

## Hackathon

- Event: General Learning Hacks, 19–20 Sep 2026, Causeway Bay
- Track: Automate Studies
- Problem: carelessness and implicit assumptions that students cannot see in their own work
- Scope: practices, past papers, assignments, homework — any submission
- Stack: TBD during the 24 hours (web app + vision + structured LLM output)

Built so a real tutor can read student state — including the premises they never wrote down — and choose what to teach next.
