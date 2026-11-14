---
name: delegate
description: Hand a piece of work to a subagent properly — understand it first, clarify the real forks with me, write the done-criteria, then delegate and check the result against them
argument-hint: "[what to delegate, e.g. 'plan step 2' or 'audit the config loader']"
---

# Delegate a piece of work

Hand work to a subagent so it comes back usable the first time.

A subagent starts with no context. It cannot ask me a question mid-run. So everything it needs
must be settled **before** it launches. That is what this skill forces: understand the work,
clear the ambiguities with me, fix what "done" means, then send it.

The work to delegate is `$ARGUMENTS`. If that is empty, ask what to delegate before anything else.

**The order matters.** Read before asking. Ask before writing gates. Write gates before
delegating. Skipping a step is how a subagent comes back with confident, useless output.

---

## 1. Understand the work yourself first

Read the real sources before forming a single question. Never ask me something a file already
answers — that wastes my time and signals you did not look.

Read, as they apply:

- The project board and any linked notes, so you know where this sits and what it blocks.
- The requirements or spec that governs it.
- The actual code the work touches — the public surface of each module it will consume.
- The build manifest, so you know the real pinned dependency versions.
- The CI config, if the work adds tests or changes the build.
- Any project design doc that settles recurring questions.

Stop reading when you can state the scope in three sentences. This is orientation, not the work
itself. Do not start solving it.

## 2. Separate the real forks from the routine calls

Sort every open point into one of two piles.

**Decide it yourself** when a competent engineer would just pick, and a wrong pick is cheap to
change. Naming, file layout, which lock type, whether a stub logs or records. Pick it, and say
in your report what you picked.

**Ask me** only when different answers produce materially different work. The test is concrete:
would the two answers change what gets built, how long it takes, or what it costs? If not, do
not ask.

Then look for the thing nobody has flagged yet:

- **A conflict between the plan and reality.** A card that says a step is parked, when the work
  in front of you forces that decision now. Surface it. Do not silently resolve it either way.
- **Scope that is stated nowhere.** A behaviour the work plainly needs, that no requirement
  covers. Name it and ask whether it is in or out.
- **A dependency pulled forward.** Work that cannot be done without something from a later step.

These are the highest-value questions. They are also the ones that get missed, because they are
not written down anywhere to be found.

## 3. Ask me — few questions, real options

Use `AskUserQuestion`. Four questions is the ceiling. Fewer is better.

Rules for each question:

- Give **2–4 concrete options**, not an open prompt. State what each one costs.
- Put your recommendation first and mark it. Never present a flat menu with no view.
- Add a `preview` when the options differ in shape rather than in degree — a small block showing
  the actual behaviour beats a sentence describing it.
- Say plainly what the answer unblocks or gates.

**Read my answer as written.** If I type a note instead of picking an option, the note wins. Do
not squeeze it back into the nearest option you offered. If I pick nothing and only comment, that
comment is the decision — restate what you understood it to mean before you act on it.

While you wait for me, do any part of the work that does not depend on my answers.

## 4. Write the verification gates — before delegating

Now fix what "done" means. Write it down as checks, not as adjectives.

Each gate must be something you can actually check when the work comes back. "Well structured"
is not a gate. These are:

- A named command that must pass. Give the exact command.
- A specific file that must exist, with the specific thing in it.
- Every requirement claimed as satisfied is pinned by a **named test function**, not by a description.
- Each stated constraint from step 3 appears in the output, and can be pointed at.
- Anything unverified is labelled as unverified, in the output itself.

Put the gates in the brief, so the subagent knows the bar. Keep your own copy, because you check
against it in step 6.

A good gate set is short. Five to eight checks that genuinely decide the outcome. A long list of
weak checks is worse than a few sharp ones.

## 5. Write the brief and delegate

Pick the agent type by what the work needs, and know its limits. A read-only planning agent
cannot write files — so if a note or doc must be produced, **you** write it from what the agent
returns. Say so in the brief, so the agent does not try and fail.

One agent by default. Only fan out in parallel when the parts are genuinely independent, and say
why in your report.

The brief must carry every one of these, because the agent has none of them:

1. **Context.** What the system is, in three or four sentences. What already exists.
2. **Exact paths to read.** List them. Do not say "look at the requirements" — name the files.
3. **The scope**, as the specific requirement IDs or behaviours in play.
4. **What is out of scope**, named just as explicitly. State what belongs to a later step and
   must not be pulled in.
5. **Every decision from step 3**, marked as a fixed constraint, with my reasoning attached.
6. **The house rules.** Simple English. State what is not true yet. Every requirement pinned by
   a named test. Do not invent config fields. Do not guess an API — verify it against the real
   pinned version, and flag it if unverifiable.
7. **The verification gates** from step 4.
8. **The output format**, section by section. Include a final section for open risks and
   unknowns, and require honesty there over confidence.

Then say to me, in a few lines: what you delegated, the constraints you locked in, and what you
will do with the result. A short table of the decisions works well.

## 6. Check the result against the gates

When the agent reports back, do not relay it. Check it.

- Walk the gates from step 4 one by one. Say which passed and which did not.
- **Verify the load-bearing claims.** If it names an API, a type, or a version, confirm that
  exists. Subagents state wrong things confidently. Treat its output as a draft, not as truth.
- If a gate failed, either fix it yourself or send the agent back with the specific gap. Do not
  pass a failed gate on to me as done.
- If it quietly dropped part of the scope, say which part.

Only then produce the artefact — the note, the doc, the board update. Write it in the same style
as the surrounding files.

## 7. Report

Short, in this order:

1. **What came back**, and whether it clears the gates. If it does not, say which gate failed.
2. **The decisions the agent made** that I did not set, and which of those are worth a second
   look.
3. **Open risks and unknowns**, especially anything it could not verify.
4. **What I wrote or changed**, and the next action.

Never report work as done when a gate is unchecked. Say the gate is unchecked, and why.
