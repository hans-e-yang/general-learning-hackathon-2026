# General Learning Hacks: Research Report and Winning-Idea Portfolio

*Generated: 18 September 2026 | Sources: 28 | Confidence: High on event facts, sponsor product, and Hong Kong evidence; Medium on which project a judge will pick (labeled as inference)*

## Executive Summary

General Learning Hacks is a 24-hour, invite-only, in-person AI/EdTech hackathon in Causeway Bay on 19–20 September 2026, with $25,000 in cash prizes and a fast-track into internships and jobs at General Learning (YC F24, formerly RevisionDojo). Official problem statements drop on the day, but the judging rubric, sponsor thesis, and local evidence already tell you what wins.

The winning pattern is not “ChatGPT with a study persona.” It is a **working tutor that (1) models what the student knows, (2) chooses what to teach next, and (3) refuses to do the thinking for them.** That is almost a direct quote of the sponsor homepage: models hallucinate and do not know what you already know; a real tutor reads student state and routes the next move ([General Learning](https://www.generallearning.com/)).

Hong Kong data makes the second half of that sentence urgent. Our Hong Kong Foundation found 95% of students and 91% of teachers already use AI, while about 23% of students struggle to finish homework without it ([SCMP, 13 Jan 2026](https://www.scmp.com/news/hong-kong/education/article/3339760/nearly-1-4-hong-kong-students-cant-finish-homework-without-ai-study-shows); [Our Hong Kong Foundation deck](https://s3.ourhkfoundation.org.hk/s3fs-public/2026-01/AI%20in%20Education_full%20deck_EN_0.pdf)). A “helpful” answer-dumper will look sophisticated and lose. An effort-preserving, state-aware prototype will look like the company the CTO is trying to build.

**Default bet if you must pick before Saturday morning:** combine the Next-Question Engine with Effort Lock into one product. **Hong Kong fork if the day-of brief is local:** HKDSE English Paper 4 group-discussion sparring scored on official speaking domains. **Design-heavy backup:** a confidence-versus-competence calibration map.

## 1. Event, rules, and how you are actually scored

### 1.1 Facts

| Item | Detail | Source |
| --- | --- | --- |
| Dates | Sat 19 – Sun 20 Sep 2026 | [Devpost](https://general-learning-hacks.devpost.com/) |
| Venue | 3/F Lee Garden 3, Causeway Bay, invite only | [Devpost](https://general-learning-hacks.devpost.com/) |
| Format | 24 hours, in person; all teammates must be present to pitch | [Official rules](https://general-learning-hacks.devpost.com/rules) |
| Team | Solo or 2–4 | [Official rules](https://general-learning-hacks.devpost.com/rules) |
| Theme | AI + EdTech: learning, productivity, or education | [Official rules](https://general-learning-hacks.devpost.com/rules) |
| Problem statements | More specific prompts released on the day | [Devpost](https://general-learning-hacks.devpost.com/) |
| Deadline | Devpost submit by 9:00 AM HKT Sunday 20 Sep 2026 | [Official rules](https://general-learning-hacks.devpost.com/rules) |
| Required artifacts | Written description, public GitHub, ≤2-minute demo video (YouTube / Vimeo / Youku) | [Official rules](https://general-learning-hacks.devpost.com/rules) |
| Prototype bar | Functioning prototype. Clickable mockups or slides without working code are ineligible for main prizes | [Official rules](https://general-learning-hacks.devpost.com/rules) |
| Fresh code | Build during the 24 hours. Libraries/APIs allowed if disclosed. Pre-work must be documented | [Official rules](https://general-learning-hacks.devpost.com/rules) |
| Prizes | Champion $12,500; First runner-up $7,500; Second runner-up $5,000 | [Devpost](https://general-learning-hacks.devpost.com/) |
| Side door | Exceptional builders fast-tracked for internships and full-time roles | [LinkedIn, 1 Sep 2026](https://www.linkedin.com/posts/general-learning_general-learning-hacks-is-coming-to-hong-activity-7500485029840551936-Wz3U) |
| Named judge | Michael Tong, CTO, General Learning | [Devpost](https://general-learning-hacks.devpost.com/) |
| Contact | shahman@revisiondojo.com | [Devpost](https://general-learning-hacks.devpost.com/) |

Devpost listed on the order of 100 invite-only participants at research time (the count on the page fluctuates). Registering on Devpost or Luma is not enough; the organizers require the Tally form ([Devpost](https://general-learning-hacks.devpost.com/); [Luma](https://luma.com/726u2rn3)).

### 1.2 The five official criteria (decode them, do not just read them)

From [Devpost judging](https://general-learning-hacks.devpost.com/):

1. **Novelty and creativity.** Unique angle, new technical ground, more creative than existing alternatives.
2. **Demonstrated use of AI/ML.** Genuinely leveraged, not superficial. Appropriate algorithm/model. Quality of implementation. Legitimate training data.
3. **Impact and relevance.** Real users. Scalable past prototype. Pressing need in Hong Kong or globally. Long-term value.
4. **Technical implementation and scalability.** Readable code, architecture that can grow, error handling, appropriate stack.
5. **Presentation and communication.** Clear problem in the video. Core functionality shown. Audience understands the value.

**Inference (not a published weight):** the named judge is a 19-year-old Stanford CS founder who built a curriculum-specific tutor because generic chatbots are not tutors ([YC company page](https://www.ycombinator.com/companies/general-learning); [join-us](https://www.revisiondojo.com/join-us)). Superficial LLM wrappers will fail criterion 2 even if the UI is pretty. Cloning RevisionDojo will fail criterion 1. A beautiful 2-minute story with a live loop will carry criterion 5, which is how 24-hour hacks are actually decided.

### 1.3 What “good enough in 24 hours” means

You need one **closed loop** on camera:

student does something → the system updates a model of the student → the next action is visibly different → the student still had to think.

That loop is the product. Everything else is set dressing.

## 2. Sponsor thesis: what General Learning already believes

### 2.1 The company

General Learning builds AI learning platforms for major curricula: **RevisionDojo** (IB), **OnePrep** (SAT, ACT, AP), **MathsGenie** (GCSE and A-level). Each brand ships question sets, notes, mini-lessons, and an AI tutor that is supposed to adapt per student ([YC](https://www.ycombinator.com/companies/general-learning)).

Public claims (treat as company-reported, not independently audited):

- One in four people on Earth is a student; the mission is accelerating humanity’s rate of learning ([generallearning.com](https://www.generallearning.com/)).
- “Models answer instantly but hallucinate and do not know what you already know. A real tutor reads student state and routes what to teach next.” ([generallearning.com](https://www.generallearning.com/))
- RevisionDojo users gain over half a point in every IB group; OnePrep survey of 1,063 users in December 2025 reported SAT gains at every starting band, with the 600–800 band gaining the most (up to 378 points, company-reported) ([generallearning.com](https://www.generallearning.com/)).
- 88 IB teachers surveyed: 96% reclaimed hours; 4.4 hours per week per task on average, led by test/assignment building at 4.8 hours ([generallearning.com](https://www.generallearning.com/)).
- Join page: 650,000+ users across 4,000+ schools in under two years; Jojo is designed to walk students through problems, **not just give answers** ([join-us](https://www.revisiondojo.com/join-us)).
- YC writeup (older snapshot): student-experience-first, curriculum-tailored AI, rather than content-delivery incumbents ([YC](https://www.ycombinator.com/companies/general-learning)).

Founders: Bowen Liu (CEO), Janet Liu (CMO/COO), Michael Tong (CTO). HQ listed as Hong Kong on YC ([YC](https://www.ycombinator.com/companies/general-learning)).

### 2.2 What they already ship (so you should not)

RevisionDojo is an all-in-one IB / MYP platform: questionbank with grading, notes, interactive lessons, SRS flashcards, past-paper videos, exam mode, predicted papers, mistakes log, coursework grader (IA / EE / TOK), IO grader, plagiarism/AI checker, Jojo tutor, Teach Jojo, study planner, grade calculator ([features](https://www.revisiondojo.com/features); [what is RevisionDojo](https://www.revisiondojo.com/help-center/what-is-revisiondojo)). School SKU adds assignments, coverage tracking, and strength/weakness analytics ([schools](https://www.revisiondojo.com/schools)).

Jojo’s advertised edge versus ChatGPT / Gemini / Claude is **IB syllabus connection plus grading and resources in one workflow**, not “we have a chatbot” ([Jojo eval, reviewed 21 Aug 2026](https://www.revisiondojo.com/research/jojo-eval)).

**Do not build:** IB question banks, Jojo clones, coursework graders, flashcard apps that are just Anki, or “ChatGPT for IB.”

### 2.3 Whitespace that still matches their worldview

| White space | Why it fits them | Why it is not their product |
| --- | --- | --- |
| Explicit, inspectable student-state model (BKT / skill graph) | Homepage thesis | Jojo is tutor-in-a-product, not a visible mastery engine judges can watch |
| Effort-preserving AI (force retrieval before hints) | They say Jojo should not dump answers | Generic tools and many hacks will dump answers; HK data says that is the crisis |
| HKDSE, especially Paper 4 oral | Impact criterion names Hong Kong | Their brands are IB / SAT-ACT-AP / GCSE-A-level |
| Parent or teacher as the *coach*, AI as the diagnostic | Dual thesis: learner outcomes + instructor productivity | Their B2B SKU is IB classroom analytics, not handwriting diagnosis |
| Metacognitive calibration (confidence vs competence) | “Know what you already know” | Not a RevisionDojo surface |
| Your-school-notes interrogation (not summarization) | Curriculum-grounded, anti-hallucination | NotebookLM already summarizes; the gap is retrieval + state |

They are also hiring fullstack/design engineers, React Native, UI/UX internships, video, and growth ([join-us](https://www.revisiondojo.com/join-us)). A prototype with student-first UX *and* a real learner model is the internship interview.

## 3. Market: what already exists, and the wrapper trap

Crowded in 2026:

- **Khanmigo** — Socratic, content-grounded, safety-positioned K–12 tutor; does not just give answers ([Khanmigo](https://www.khanmigo.ai/)).
- **Gemini Guided Learning / NotebookLM** — multimodal explanations; NotebookLM is grounded in *your* uploads with citations ([Google for Education](https://edu.google.com/intl/ALL_in/ai-notebooklm/)).
- **ChatGPT Study Mode, Claude education artifacts, Perplexity Learn Mode** — general tools adding tutoring skins (Jojo’s own comparison table) ([Jojo eval](https://www.revisiondojo.com/research/jojo-eval)).
- **Synthesis Tutor** — adaptive game-like K–5 math ([2026 comparison](https://academicaitrends.com/blog/khanmigo-vs-synthesis-tutor-vs-socratic-2026/)).
- **MagicSchool / Brisk** — teacher productivity, not student mastery ([2026 comparison](https://alatirok.com/ai-in-education-2026-khanmigo-synthesis-magicschool-brisk/)).
- **Local DSE content blogs / tools** (e.g. Thinka) already describe AI oral sparring and mark-scheme decoding ([Thinka oral](https://www.thinka.ai/en-HK/blogs/6ss0GOJhPQZe0SGtXXYY/The-Verbal-Performance-Pilot-Mastering-HKDSE-Paper-4-through-Multimodal-AI-Sparring)). Unverified how deep the products are; assume the *idea* of “AI oral practice” is not novel by itself.

Reported gaps across these products (treat as synthesis, not a single lab result): persistent cross-session learner models, automatic spaced review tied to a knowledge state, explainable next-item routing, and reliable resistance to answer dumping.

**Hackathon pattern that already worked elsewhere:** TutorTrace combined Bayesian Knowledge Tracing, misconception-tagged distractors, prerequisite pivots, memory decay, and an on-screen “why this question” ([TutorTrace Devpost](https://devpost.com/software/tutortrace)). Homework X-Ray photographed real handwriting, confirmed the transcript, diagnosed a misconception, then coached the *parent* with Socratic questions instead of handing the child the answer ([Homework X-Ray Devpost](https://devpost.com/software/homework-x-ray)). Steal the mechanism, not the name.

## 4. Hong Kong evidence (this is how you win “Impact”)

### 4.1 Students are already using AI — badly

Our Hong Kong Foundation surveyed about 1,200 primary and secondary teachers and students from July–December 2025 ([SCMP](https://www.scmp.com/news/hong-kong/education/article/3339760/nearly-1-4-hong-kong-students-cant-finish-homework-without-ai-study-shows)):

- 91% of teachers and 95% of students use AI in teaching/learning ([SCMP](https://www.scmp.com/news/hong-kong/education/article/3339760/nearly-1-4-hong-kong-students-cant-finish-homework-without-ai-study-shows); [OHKF deck](https://s3.ourhkfoundation.org.hk/s3fs-public/2026-01/AI%20in%20Education_full%20deck_EN_0.pdf)).
- About 23% of students struggle to complete homework without AI; only 39% felt confident they could work independently ([Young Post / SCMP coverage](https://www.youngpostclub.com/spark/news/hong-kong/education/article/3340131/study-finds-23-hong-kong-students-need-ai-finish-homework)). The same deck also states “1 in 5” in a summary slide — use **23% / nearly 1 in 4** as the headline figure from the news writeups, and note the deck’s “1 in 5” as a rounded talking point ([OHKF deck](https://s3.ourhkfoundation.org.hk/s3fs-public/2026-01/AI%20in%20Education_full%20deck_EN_0.pdf)).
- 71% of teachers worried about problem-solving; 63% about critical thinking ([SCMP](https://www.scmp.com/news/hong-kong/education/article/3339760/nearly-1-4-hong-kong-students-cant-finish-homework-without-ai-study-shows)).
- 16% of students admitted putting personal data into tools ([SCMP](https://www.scmp.com/news/hong-kong/education/article/3339760/nearly-1-4-hong-kong-students-cant-finish-homework-without-ai-study-shows)).
- 42% of teachers who do **not** use AI cited lack of time or resources to explore it ([OHKF deck](https://s3.ourhkfoundation.org.hk/s3fs-public/2026-01/AI%20in%20Education_full%20deck_EN_0.pdf)).
- McKinsey figure cited in the same deck: education technology could reclaim about 13 teacher hours per week ([OHKF deck](https://s3.ourhkfoundation.org.hk/s3fs-public/2026-01/AI%20in%20Education_full%20deck_EN_0.pdf)).

TVB reported DSE candidates already using AI mind maps and interactive oral tutors, and teachers using AI for individualized marking comments ([TVB, 4 Apr 2026](https://news.tvb.com/sc/pearlnews/69d0feb3bec86a88cbf0df41/TVB%20News-AI-supported-DSE-preparation---students-turn-to-tech-to-improve-edge)).

### 4.2 DSE stress is not a side quest

HKFYG’s DSE 2026 survey: nearly 46% of candidates reported high stress before results; ~70% fear losing competitive edge; ~49% found academic/career pathway planning highly difficult ([HKFYG, 9 Jul 2026](https://hkfyg.org.hk/en/2026/07/09/dse-2026-survey/)). The 2025 wave had 52.9% of sitting candidates at high results-day stress, a six-year high ([HKFYG 2025 release PDF](https://hkfygwebcdn.azureedge.net/wp-content/uploads/2025/07/%E9%9D%92%E5%8D%94%E6%96%B0%E8%81%9E%E7%A8%BF_%E5%85%AC%E5%B8%83%E6%87%89%E5%B1%86%E6%96%87%E6%86%91%E8%A9%A6%E8%80%83%E7%94%9F%E5%8D%87%E5%AD%B8%E8%A9%8F%E5%8A%83%E8%AA%BF%E6%9F%A5.pdf)).

A career-matching chatbot is an easy HK story and a weak “rate of learning” story. Prefer tools that raise competence (or oral performance) under that stress.

### 4.3 HKDSE English Paper 4 is a concrete, judgeable skill

Official framework: Paper 4 is Group Interaction (10 minutes prep, 8 minutes discussion in a group of four) plus a one-minute Individual Response ([2026 HKEAA assessment framework](https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/eng_lang/2026hkdse-e-elang.pdf)). Four scoring domains: pronunciation and delivery; communication strategies; vocabulary and language patterns; ideas and organisation ([HKEAA speaking guidelines](https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/eng_lang/EngDSESpeakingGuidelines2019.pdf); [level descriptors](https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/eng_lang/LevelDescriptors-ENG-Speaking.pdf)). Devices, including AI, are banned in the hall ([Star Headline / HKEAA tips, Mar 2026](https://www.stheadline.com/knowledge/3549933/DSE-2026%E8%8B%B1%E6%96%87%E5%8F%A3%E8%A9%A6Oral-10%E5%80%8B%E5%BF%85%E7%9D%87%E6%B3%A8%E6%84%8F%E4%BA%8B%E9%A0%85-%E9%81%B2%E8%87%B3XX%E5%88%86%E9%90%98%E5%B0%B1%E8%A6%81%E6%94%B9%E6%9C%9F%E8%80%83%E8%A9%A6)).

The product opportunity is **practice that scores interaction**, not another fluency chatbot. Thinka already narrates this space ([Thinka](https://www.thinka.ai/en-HK/blogs/6ss0GOJhPQZe0SGtXXYY/The-Verbal-Performance-Pilot-Mastering-HKDSE-Paper-4-through-Multimodal-AI-Sparring)) — you need a twist: official-domain scoring, silence traps, and a persistent speaking-skill state.

## 5. Learning science the CTO can respect

Two techniques have **high utility** across learners, materials, and tests: **practice testing (retrieval)** and **distributed practice (spacing)**. Highlighting, rereading, and summarization have **low utility** even though students love them ([Dunlosky et al., 2013, *Psychological Science in the Public Interest*](https://www.psychologicalscience.org/journals/pspi/1529100612453266/); [APS summary](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)).

Testing does not just measure memory. Roediger and Karpicke (2006) found that after a delay, prior testing beat restudying, even though restudying made people *more confident* ([PubMed](https://pubmed.ncbi.nlm.nih.gov/16507066/)). That single result is the plot of the calibration product: confidence is not competence.

Cepeda et al. (2006) synthesized 254 studies (~14,000 participants): spaced practice beat massed practice on delayed retention (reported around d ≈ 0.8 in later surveys; Scientific American cites 47% vs 37% recall in that synthesis) ([Scientific American coverage of Dunlosky](https://www.scientificamerican.com/article/psychologists-identify-best-ways-to-study/); [Cepeda via Dunlosky toolbox](https://files.eric.ed.gov/fulltext/EJ1021069.pdf)).

Interleaving is useful mainly when items are similar enough that *discriminating them is the skill*. Dunlosky rated it moderate, not high ([Dunlosky 2013](https://www.psychologicalscience.org/journals/pspi/1529100612453266/)). Do not claim interleaving as a silver bullet.

**Student modeling:** Corbett and Anderson (1995) Bayesian Knowledge Tracing estimates P(mastered) per skill from responses using P(L0), P(T), P(G), P(S), then routes practice until mastery ([UMUAI](https://doi.org/10.1007/bf01099821); [PDF](http://act-r.psy.cmu.edu/wordpress/wp-content/uploads/2012/12/893CorbettAnderson1995.pdf)). For a 24-hour hack, a transparent BKT with 6–8 skills beats a hidden LLM “personalization” prompt.

**AI-specific risk:** EFFORT-AI (2026) argues generative AI currently accelerates fluency at the exact moment the learner should be retrieving, explaining, and transferring. Educational AI is defensible when it removes friction but **preserves target cognition** ([Frontiers in Education](https://doi.org/10.3389/feduc.2026.1849821)). Khan Academy has also observed students typing “idk” instead of thinking with tutors ([K-12 Dive](https://www.k12dive.com/news/3-questions-for-k-12-leaders-to-consider-amid-the-ai-tutoring-boom/757314/)).

Students rarely apply spacing and interleaving with chatbots unless the product *forces the structure* ([CSEDU 2025 abstract](https://www.insticc.org/node/TechnicalProgram/csedu/2025/presentationDetails/132720)).

**Design law for this hackathon:** AI prepares questions, diagnoses errors, and schedules review. The human retrieves, distinguishes, and transfers.

## 6. Kill list (do not build these)

These will flood the room and lose on novelty, genuine AI, or both.

1. ChatGPT wrapper with a “study buddy” persona.
2. IB / Jojo clone (notes, questionbank, coursework grader, Teach Jojo).
3. PDF / lecture summarizer (NotebookLM already exists).
4. Flashcards without a learner model or exam-date spacing.
5. Points, streaks, and avatars with no learning mechanism.
6. Answer-dumping homework solvers and Photomath clones that show the solution.
7. Generic “AI career counselor” with no skill model (weak on the mission).
8. Slide-only concepts. Ineligible for main prizes ([rules](https://general-learning-hacks.devpost.com/rules)).

## 7. Scoring method

Each idea is scored 1–5 on the five official criteria. **Total /25.** Separate **24h feasibility** 1–5 (not official, but it is how you avoid a beautiful zero).

| Score | Meaning |
| --- | --- |
| 5 | Directly performs a published sponsor or judge test |
| 4 | Strong, with a known crowded alternative you must differentiate |
| 3 | Fine, will not carry the pitch alone |
| 2 | Easy to look generic or vaporware |
| 1 | Conflicts with rules, mission, or 24h reality |

**These scores are reasoned judgments, not measurements.** “1000% win” here means: highest expected value against this rubric, this judge, this city, this time box — not a guaranteed first place.

## 8. Ranked ideas

### Tier S — bet the hackathon

#### S1. Next-Question Engine (student-state tutor) — 24/25, feasibility 4

**Scores:** Novelty 5 · AI/ML 5 · Impact 5 · Tech 4 · Pitch 5

A live mastery probability per skill. Wrong answers are classified (slip vs misconception vs missing prerequisite vs “I don’t know”). The system **says out loud** why the next item was chosen. This is the homepage thesis as a demo ([General Learning](https://www.generallearning.com/); [Corbett & Anderson 1995](https://doi.org/10.1007/bf01099821); [TutorTrace](https://devpost.com/software/tutortrace)).

**Demo hook:** a graph of eight skills. Student misses a two-step equation. Mastery of “two-step” barely drops; “fractions” lights red; next item is a fraction, and a caption reads “routed to prerequisite, not a harder clone.”

**24h cut:** 6–8 skills, ~6 items each, BKT in one Python/TS module, LLM only for misconception labels and Socratic hints. Do not train a neural DKT.

#### S2. Effort Lock (anti-offload tutor) — 23/25, feasibility 5

**Scores:** Novelty 5 · AI/ML 4 · Impact 5 · Tech 4 · Pitch 5

The AI is not allowed to emit the worked solution until the student has attempted, explained, or chosen among hints. Then a *transfer* item in a new surface proves learning. This is the OHKF independence crisis as a product ([SCMP / OHKF](https://www.scmp.com/news/hong-kong/education/article/3339760/nearly-1-4-hong-kong-students-cant-finish-homework-without-ai-study-shows); [EFFORT-AI](https://doi.org/10.3389/feduc.2026.1849821)).

**Demo hook:** split screen. Left: ChatGPT dumps the answer in 2 seconds. Right: this tool waits, asks, hints, then a transfer question the dump-user fails and the effort-user hits.

**24h cut:** a state machine (attempt → hint1 → hint2 → worked step → transfer). LLM behind JSON schema. Timer and locked “Reveal” button are the UX.

#### S3. Combined product: STATE (Next-Question + Effort Lock) — 24/25, feasibility 4

This is the default recommendation. One loop: attempt (forced) → classify error → update BKT → route next → never dump. Remaps onto almost any day-of prompt about tutoring, cheating, personalization, or “real AI.”

#### S4. Oral Table (HKDSE Paper 4 group sparring) — 21/25, feasibility 3

**Scores:** Novelty 4 · AI/ML 4 · Impact 5 · Tech 3 · Pitch 5

Four-voice group discussion with silence traps, turn-taking, and scores on the four HKEAA domains ([HKEAA framework](https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/eng_lang/2026hkdse-e-elang.pdf); [speaking guidelines](https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/eng_lang/EngDSESpeakingGuidelines2019.pdf)). Local impact is explicit in the rubric.

**Twist vs “AI speaking partner” blogs:** score *interaction moves* (initiate, invite, disagree, salvage dead air), store a speaking-skill state, and run Part B one-minute individual response.

**Risk:** voice APIs flake; Thinka already occupies the narrative. Feasibility 3 is the warning. Have a typed fallback that still scores domains.

**Demo hook:** 45-second live table. One AI peer goes silent. Student has to facilitate. Dashboard ticks Communication Strategies.

#### S5. Know-It-or-Not (calibration map) — 20/25, feasibility 5

**Scores:** Novelty 4 · AI/ML 3 · Impact 4 · Tech 4 · Pitch 5

After each topic: “How sure are you?” then a retrieval item. Plot confidence against accuracy. Restudying inflates confidence without inflating memory ([Roediger & Karpicke 2006](https://pubmed.ncbi.nlm.nih.gov/16507066/)). Directly operationalizes “know what you already know.”

**Demo hook:** a student who highlighted notes for an hour sits at 90% confidence / 40% accuracy. The plan rewrites itself to the red cells only.

**24h cut:** smallest code of the S-tier. Best backup if the team is design-heavy or the engine slips.

#### S6. Worksheet X-Ray (parent/teacher coach) — 20/25, feasibility 3

**Scores:** Novelty 4 · AI/ML 4 · Impact 4 · Tech 3 · Pitch 5

Photo of real handwriting → human confirms transcript → misconception diagnosis → adult gets ordered Socratic questions, never the answer ([Homework X-Ray](https://devpost.com/software/homework-x-ray)). Hits the dual thesis of student outcomes plus adult productivity ([generallearning.com](https://www.generallearning.com/)).

**Risk:** vision errors. The confirmation gate is mandatory or you will demo a confident wrong diagnosis.

### Tier A — win with a sharp twist

#### A7. Prerequisite Repair — 21/25, feasibility 4

Failure is usually a hidden missing skill. Overlaps S1; if you only have time for one visualization, make it the prerequisite graph. Li et al. (2024) related-interleaving is supporting color, not the core claim ([HICSS 2026 SmartStudy paper](https://doi.org/10.24251/hicss.2026.004)).

#### A8. Five Student States — 21/25, feasibility 3

Detect productive struggle vs confusion vs frustration vs disengagement vs breakthrough (latency, “idk”, backspaces, tone). **Withhold help during productive struggle.** Pedagogically elite; sensors are messy in 24h. Better as a module inside STATE than as the whole app.

#### A9. Teacher Live Heatmap — 20/25, feasibility 4

Twenty simulated students answer; a class misconception cluster lights up; teacher gets one intervention. Matches school SKU thinking ([RevisionDojo for schools](https://www.revisiondojo.com/schools)) and teacher-hour evidence ([OHKF / McKinsey 13h](https://s3.ourhkfoundation.org.hk/s3fs-public/2026-01/AI%20in%20Education_full%20deck_EN_0.pdf)). Demo needs a canned classroom or it looks fake.

#### A10. Transfer Gym — 19/25, feasibility 4

Same concept, new surface, until they can transfer. Learning-science gold, slightly abstract on camera unless you pick one concept (e.g. “rate”) across word problem / graph / experiment.

#### A11. Your-Notes Interrogator — 19/25, feasibility 4

RAG over the student’s own notes, but it **never summarizes**. It quizzes, waits, then cites the source paragraph. Differentiation versus NotebookLM is the whole pitch ([Google NotebookLM](https://edu.google.com/intl/ALL_in/ai-notebooklm/)). Without Effort Lock this collapses into a summarizer.

#### A12. AI-Proof Homework — 19/25, feasibility 4

Tasks that require personal evidence plus a 30-second oral defense. Scores thinking, not prose. Direct answer to 23% dependence. Easy to look like a plagiarism detector (they already have one).

#### A13. Mark-Scheme Skill Atoms — 17/25, feasibility 4

Do not output “Level 5**.” Extract examiner skills (elaboration, cohesion, evaluative stance) and drill the failing atom ([Thinka mark-scheme piece](https://www.thinka.ai/en-HK/blogs/iN5zBH3XGgeLhIwphzI3/The-Mark-Scheme-Decoder-Transforming-HKDSE-Mock-Feedback-into-a-Level-5**-Revision-Blueprint)). Crowded idea; win only if atoms update a skill state.

### Tier B — only if the day-of prompt forces it

| ID | Idea | /25 | Feas. | Why it is secondary |
| --- | --- | --- | --- | --- |
| B14 | EMI Cantonese–English code-switch explainer | 18 | 4 | Strong HK flavor, weaker “rate of learning” unless paired with retrieval |
| B15 | SEN / dyslexia-first retrieval tutor | 17 | 3 | Morally strong; easy to get wrong without domain experts |
| B16 | Portable learner passport (state that could plug into Jojo) | 17 | 2 | Conceptually aligned, vaporware risk in 24h |
| B17 | Lab / AR simulation | 17 | 1 | Wow, build-risk |
| B18 | Peer complementarity matcher | 15 | 3 | Cute, thin ML |
| B19 | HK AI-literacy micro-tutor (2026 digital-education blueprint) | 15 | 4 | Policy-aligned, easy to become a content site |
| B20 | DSE / career pathway coach | 14 | 4 | Real HKFYG pain, off-mission versus “rate of learning” |
| B21 | Sleep / attention-aware scheduler | 13 | 4 | Looks gimmicky next to a knowledge tracer |

## 9. What “1000% win” actually means here

No idea is a guaranteed champion. A 24-hour room of ~100 invited builders will produce several pretty chat UIs. The expected-value winners share four properties:

1. **Quote the sponsor without cloning the product.** Student state + next action + no answer dump.
2. **Show the model.** A number or graph that moves. Hidden prompts do not count as ML under criterion 2.
3. **Use Hong Kong or global evidence in one sentence** (23% cannot finish homework without AI; DSE oral has four official domains; retrieval beats rereading).
4. **Fit in a 2-minute video** with a before/after the camera can see.

If engineering time is short, **S5 calibration** still beats a wrapper. If the brief is “Hong Kong education,” **S4 oral** with a typed fallback. If you can ship one real loop, **S3 STATE**.

## 10. Top-three 24-hour playbooks

Assume a mixed student team, Next.js (or Vite + React) frontend, one API route, one LLM (OpenAI or Gemini) with **JSON schema**, no training job, public GitHub, 2-minute screen recording.

### Playbook A — STATE (default bet)

**One-sentence pitch:** Generic AI answers instantly and does not know what you know. STATE estimates mastery per skill, forces you to try, and routes the next problem — including backwards to the prerequisite you actually lack.

**Must-have loop**

1. Diagnostic: 4–6 items, including “I don’t know.”
2. BKT update per skill (show P(mastered) as a bar).
3. Forced attempt (Reveal locked for N seconds / until a typed attempt).
4. Error class: slip / misconception / missing prerequisite / unknown.
5. Next item with a one-line explanation.
6. Transfer item after two successes.

**Architecture**

- `skills.json` — 8 algebra (or DSE maths / IB maths) skills, prerequisites, misconception tags.
- `items.json` — 6 items per skill, distractors tagged.
- `bkt.ts` — Corbett-style update. Hard-code reasonable priors (e.g. L0=0.3, T=0.1, G=0.2, S=0.1); do not pretend you fitted ASSISTments unless you did.
- `policy.ts` — if P(prereq) < 0.5, serve prereq; else lowest mastery above a struggle band; epsilon-greedy 10% for exploration.
- `tutor.ts` — LLM returns `{feedback, hint, error_class}` only. System prompt: never include the final numeric answer until `unlock: true`.
- UI: left = problem + attempt; right = skill graph + “Why this item.”

**Honest about ML:** BKT is the ML. The LLM is a classifier and hint generator. Say that in the README. Judges asked for legitimate technique choice, not a fake neural net.

**2-minute demo script**

0:00 Problem: ChatGPT is used by 95% of HK students; 23% cannot finish homework without it. That is not learning.
0:20 Live: student gets a two-step equation wrong.
0:40 Graph routes to fractions. Caption: “next teach, not next clone.”
1:00 Reveal is locked. Student attempts. Socratic hint.
1:20 Transfer item in a new story context.
1:40 Teacher/parent view: one sentence “this student is guessing on fractions.”
1:55 CTA: student-state tutoring you can inspect.

**Day-of remap**

| If the live prompt is… | You change… |
| --- | --- |
| Personalization / adaptive learning | Keep as-is. This is the answer. |
| Cheating / over-reliance / AI literacy | Lead with Effort Lock; BKT is the proof they learned. |
| Teachers / schools | Add the 8-student heatmap tab. |
| Exam prep | Swap item pack to DSE or IB topic; do not clone Jojo content. |
| Productivity | Frame as “cut wasted study on already-mastered skills.” |
| Language / oral | Do not force STATE. Switch to Playbook B. |

**Do not:** generate the whole question bank with an LLM at runtime (hallucinated mark schemes). Curate 48 items before or in the first three hours.

### Playbook B — Oral Table (HK fork)

**One-sentence pitch:** HKDSE Paper 4 grades interaction, not a monologue. Oral Table is a four-person discussion with silence traps, then scores you on the four official HKEAA domains.

**Must-have loop**

1. Pick a past-paper-style prompt (school fair, AI in education, teenage stress).
2. 60-second prep notes (shortened from 10 minutes for demo).
3. 90-second group discussion: 3 AI peers + student. One peer is quiet, one interrupts.
4. Domain scores 0–7 with evidence quotes.
5. One-minute individual response.
6. Skill state: “initiate,” “invite others,” “dead-air salvage,” “elaboration.”

**Architecture**

- Realtime voice if you can (Gemini Live / OpenAI Realtime). **Typed chat with TTS playback is the fallback** and still counts as a working prototype.
- LLM roles: Facilitator, Interrupter, Silent, Examiner.
- Rubric scorer: JSON `{pronunciation, communication, language, ideas, evidence[]}`. Pronunciation is weak without audio — if typed, say so and score the other three plus a fluency proxy from audio if present.
- Store session traces.

**2-minute demo script**

0:00 Paper 4 is 8 minutes with three strangers. You cannot practice that with a textbook.
0:20 Table starts. Interrupter dominates.
0:40 Student invites the silent peer (Communication Strategies tick).
1:00 Dead air. Student salvages.
1:20 Domain bars + evidence quote.
1:40 Individual response. Compare attempt 1 vs attempt 2 speaking-state.
1:55 “Practice the exam you actually sit, not a chatbot monologue.”

**Day-of remap**

| Live prompt | Change |
| --- | --- |
| Hong Kong / DSE / local impact | Lead with this. |
| Language learning | Same engine, IELTS/IB oral pack. |
| Soft skills / collaboration | Drop HKEAA branding; keep interaction scoring. |
| Accessibility | Add captions + typed mode as a feature, not a fallback. |

**Do not:** claim official HKEAA marking. Say “practice aligned to published level descriptors.”

### Playbook C — Know-It-or-Not (backup)

**One-sentence pitch:** Rereading makes you confident. Testing makes you remember. This map shows where those two numbers disagree, then only schedules the red cells.

**Must-have loop**

1. Upload or pick a topic list (or paste notes → extract 12 claims).
2. For each claim: confidence slider 0–100, then a retrieval question.
3. Scatter plot: x = confidence, y = accuracy. Quadrants: known, lucky, illusion of knowing, unknown.
4. Spaced plan: illusion-of-knowing first, expanding intervals.
5. Restudy vs test toggle that shows predicted confidence inflation.

**Architecture**

- Claim extractor (LLM) + stored claims.
- Quiz items generated once and frozen (do not regenerate every render).
- Calibration error = |confidence − accuracy|.
- Optional tiny BKT on claims that were tested.

**2-minute demo script**

0:00 Students highlight notes. It feels like learning. It is not.
0:20 Live: 90% sure, wrong on retrieval.
0:50 Heatmap of a mock “tonight’s biology chapter.”
1:10 Plan: 12 minutes on red cells, skip green.
1:30 Second pass: calibration error drops.
1:50 “Know what you know — then study what you don’t.”

**Day-of remap:** works for metacognition, study skills, exam prep, notes, “productivity.” Weak if the prompt demands multimodal oral or classroom teacher tools — then use A or B.

## 11. Saturday operating system (so the idea survives contact with the event)

1. **Hour 0:** photograph the live problem statements. Map each to Playbook A/B/C. Do not invent a fourth product unless all three miss.
2. **Hour 0–1:** freeze the loop. Write the 2-minute script *before* extra features.
3. **Hour 1–8:** data + core loop + ugly UI.
4. **Hour 8–16:** polish the one graph judges will remember. Record a backup video at hour 16 while you still have energy.
5. **Hour 16–20:** README that names the ML (BKT / rubric classifier / calibration error), discloses APIs, and lists what was built during the hackathon.
6. **Hour 20–24:** Devpost text, public GitHub, video upload. Cut features, not the loop.
7. **Pitch language to steal (all sourced):**
   - “A real tutor reads student state and routes what to teach next.”
   - “95% of HK students use AI; about 23% cannot finish homework without it.”
   - “Jojo walks students through problems, not just answers — we made that inspectable.”
   - “Practice testing and spacing have high utility; highlighting does not.”

## 12. Gaps and caveats

- Day-of problem statements were not published at research time ([Devpost](https://general-learning-hacks.devpost.com/)). The portfolio is built to remap.
- Prize weights across the five criteria are unpublished. Scores are equal-weighted.
- Company outcome numbers are self-reported.
- OHKF “1 in 5” vs news “23% / nearly 1 in 4” is a rounding inconsistency in secondary materials; both point the same direction.
- Firecrawl/Exa were not available. `parallel-cli` 0.9.2 is installed but a full `research run` was skipped to deliver this report before the 19 Sep start; findings use web search plus full-page fetches of official pages.
- No public archive of prior General Learning Hacks winners was found (this appears to be the Hong Kong edition’s first run). Winner patterns are inferred from the rubric, sponsor, and other EdTech hacks.

## Key takeaways

1. Build a **visible student-state loop** that **does not dump answers**. That is the company’s religion and the room’s gap.
2. Use **Hong Kong AI-dependence** or **HKEAA Paper 4 domains** for Impact; do not rebuild IB.
3. If you can only ship one thing, ship **STATE**. If the brief is local language, ship **Oral Table** with a typed fallback. If the team is thin on engineering, ship **Know-It-or-Not**.
4. Record the video from a working loop, not from slides. Slides cannot win ([rules](https://general-learning-hacks.devpost.com/rules)).

## Sources

1. [General Learning Hacks Devpost](https://general-learning-hacks.devpost.com/) — event, prizes, judging, day-of prompts.
2. [Official rules](https://general-learning-hacks.devpost.com/rules) — eligibility, fresh code, submission, prototype bar.
3. [Luma event](https://luma.com/726u2rn3) — Tally registration required.
4. [General Learning LinkedIn, 1 Sep 2026](https://www.linkedin.com/posts/general-learning_general-learning-hacks-is-coming-to-hong-activity-7500485029840551936-Wz3U) — internships/jobs fast-track.
5. [generallearning.com](https://www.generallearning.com/) — thesis, outcome claims, teacher-time claims.
6. [YC: General Learning](https://www.ycombinator.com/companies/general-learning) — brands, founders, student-experience insight.
7. [RevisionDojo join-us](https://www.revisiondojo.com/join-us) — Jojo “not just answers,” hiring, user counts.
8. [What is RevisionDojo](https://www.revisiondojo.com/help-center/what-is-revisiondojo) — IB/MYP scope.
9. [RevisionDojo features](https://www.revisiondojo.com/features) — product surface area.
10. [RevisionDojo for schools](https://www.revisiondojo.com/schools) — teacher analytics SKU.
11. [Jojo vs ChatGPT/Gemini/Claude](https://www.revisiondojo.com/research/jojo-eval) — competitive positioning, Aug 2026.
12. [Jojo AI tutor](https://www.revisiondojo.com/features/jojo-ai-tutor) — product behavior.
13. [SCMP, 13 Jan 2026](https://www.scmp.com/news/hong-kong/education/article/3339760/nearly-1-4-hong-kong-students-cant-finish-homework-without-ai-study-shows) — 95/91/23/16/71 figures.
14. [Young Post on OHKF](https://www.youngpostclub.com/spark/news/hong-kong/education/article/3340131/study-finds-23-hong-kong-students-need-ai-finish-homework) — 39% confident independently; teacher concern rates.
15. [OHKF AI in education deck, Jan 2026](https://s3.ourhkfoundation.org.hk/s3fs-public/2026-01/AI%20in%20Education_full%20deck_EN_0.pdf) — 42% teacher time barrier; 13h McKinsey cite; 1-in-5 slide.
16. [Dotdotnews / Deepline on OHKF](https://english.dotdotnews.com/a/202601/15/AP69685cb4e4b0c32d4f660a0e.html) — teacher vs student tool mix.
17. [HKFYG DSE 2026 survey](https://hkfyg.org.hk/en/2026/07/09/dse-2026-survey/) — stress and pathway difficulty.
18. [HKFYG DSE 2025 survey PDF](https://hkfygwebcdn.azureedge.net/wp-content/uploads/2025/07/%E9%9D%92%E5%8D%94%E6%96%B0%E8%81%9E%E7%A8%BF_%E5%85%AC%E5%B8%83%E6%87%89%E5%B1%86%E6%96%87%E6%86%91%E8%A9%A6%E8%80%83%E7%94%9F%E5%8D%87%E5%AD%B8%E8%A9%8F%E5%8A%83%E8%AA%BF%E6%9F%A5.pdf) — 52.9% high stress.
19. [TVB, 4 Apr 2026](https://news.tvb.com/sc/pearlnews/69d0feb3bec86a88cbf0df41/TVB%20News-AI-supported-DSE-preparation---students-turn-to-tech-to-improve-edge) — students/teachers already using AI for DSE.
20. [HKEAA 2026 English assessment framework](https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/eng_lang/2026hkdse-e-elang.pdf) — Paper 4 structure.
21. [HKEAA speaking guidelines](https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/eng_lang/EngDSESpeakingGuidelines2019.pdf) — four domains, 0–7 marks.
22. [HKEAA speaking level descriptors](https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/eng_lang/LevelDescriptors-ENG-Speaking.pdf) — Level 5 interaction language.
23. [Dunlosky et al. 2013](https://www.psychologicalscience.org/journals/pspi/1529100612453266/) — high-utility techniques.
24. [Roediger & Karpicke 2006](https://pubmed.ncbi.nlm.nih.gov/16507066/) — testing effect vs confidence.
25. [Corbett & Anderson 1995](https://doi.org/10.1007/bf01099821) — Bayesian Knowledge Tracing.
26. [EFFORT-AI 2026](https://doi.org/10.3389/feduc.2026.1849821) — preserve target cognition.
27. [TutorTrace](https://devpost.com/software/tutortrace) / [Homework X-Ray](https://devpost.com/software/homework-x-ray) — hackathon mechanisms that already landed.
28. [Khanmigo](https://www.khanmigo.ai/), [NotebookLM](https://edu.google.com/intl/ALL_in/ai-notebooklm/), [K-12 Dive on AI tutors](https://www.k12dive.com/news/3-questions-for-k-12-leaders-to-consider-amid-the-ai-tutoring-boom/757314/) — crowded alternatives and “idk” failure mode.

## Methodology

Searched 14+ web queries and fetched official Devpost, rules, General Learning, YC, RevisionDojo, HKEAA, OHKF, and HKFYG pages. Sub-questions: (1) how this hackathon is judged, (2) what General Learning already is and is not, (3) what the 2026 AI-tutor market already covers, (4) which Hong Kong problems are both real and demoable, (5) which learning-science mechanisms a CTO will not laugh at.

Analyzed 28 sources. No prior GL Hacks winner list was found. Idea scores are expert judgments against the published rubric, not experimental results.
