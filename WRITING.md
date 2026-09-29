# Writing principles

General-purpose writing guidelines. They apply to any prose: design docs, READMEs, RFCs,
runbooks, plan documents, oncall guides, code comments, and messages.

Distilled from Google's Technical Writing course with a touch of personalization.

The structural skeleton of any specific document type lives elsewhere; this file is about the
prose itself.

## Clarity over everything

When a rule conflicts with clarity, clarity wins. Every other guideline in this file serves
clarity.

## Words

### Words and terms

- Define unfamiliar terms on first use, or link to an explanation.
- Use a term consistently. Do not silently rename mid-document; readers assume a renaming
  signals a distinction.
- Acronyms: spell out the full term and put the acronym in parentheses on first use; both bold.
  Skip acronyms used only a few times.
- Beware ambiguous pronouns. *It*, *they*, *this*, *that* often introduce errors when the
  antecedent is more than a few words back. When in doubt, repeat the noun.
- Avoid slang and informal shorthands — prefer simple, common expressions.

## Sentences

### Active voice, strong verbs

Default to active voice. The actor + verb + target shape is shorter, clearer, and harder to
misread.

- Prefer: "The constructor produces an `Origins` struct."
- Avoid:  "An `Origins` struct is produced by the constructor."

Replace generic verbs (*is*, *are*, *occurs*, *happens*) with specific ones. Generic verbs often
signal a missing actor or a hidden passive.

- Prefer: "Dividing by zero raises the exception."
- Avoid:  "The exception occurs when dividing by zero."

Imperative verbs are active by default ("Open the file", "Run the migration") — the implied
actor is the reader.

Doc comments may drop the subject, since the documented symbol is the implied actor ("Returns the
rows", "Called before the deletion"). Do not name a caller to fill the gap.

### Reduce filler

Cut "there is" / "there are" constructions; promote the real subject to the front of the
sentence. Trim filler phrases.

| Wordy                              | Concise   |
| ---------------------------------- | --------- |
| at this point in time              | now       |
| determine the location of          | find      |
| is able to                         | can       |
| causes the triggering of           | triggers  |
| provides a detailed description of | describes |

#### Keep the connectives

Keep *that*, *which*, *when*, and articles wherever dropping them forces a re-read.

- Prefer: "a stack that GitHub restacked after a merge"
- Avoid:  "a stack GitHub restacked after a merge"

### Single idea per sentence

Each sentence carries one idea. If a sentence runs long, split it; if it contains an embedded
list, lift the list out. Long sentences with conjunctions ("or", "and then") are usually
disguised lists.

### Avoid garden-path openings

Readers commit to a parse within the first few words. Open with the actor, and format UI names
so they read as names.

- Prefer: "**Adopt** resets each branch to its remote commit."
- Avoid:  "Adopting points each layer at its remote's commit."

A bare gerund at the start of a sentence parses as a noun phrase ("adopting points") until the
reader finds no verb.

### Punctuation

- Commas where a reader naturally pauses; serial (Oxford) comma to reduce ambiguity.
- Avoid comma splices. Use a period or a semicolon.
- Semicolons unite two grammatically complete, closely related sentences. Test: the meaning
  survives flipping the two halves.
- Em dashes mark stronger breaks than commas; use sparingly.
- Parentheses for minor digressions. Period inside if the parentheses contain a full sentence;
  outside otherwise.

## Paragraphs and layout

### Paragraph discipline

- The opening sentence states the paragraph's main point. Skimmers will not read further.
- One topic per paragraph. Off-topic sentences either get cut or move to their own paragraph.
- Three to five sentences is the sweet spot. Longer paragraphs become walls of text; many
  one-sentence paragraphs signal poor organisation.
- A strong paragraph answers *what*, *why*, and *how* — what the reader is being told, why it
  matters, how to use the information.

### Lists and tables

- Bulleted for unordered items, numbered for ordered ones. Convert embedded prose lists into
  real lists.
- Items must be parallel: same grammar, same logical category, same capitalisation, same
  punctuation.
- Numbered items start with imperative verbs ("Open the file", "Run the migration").
- Introduce every list and table with a sentence ending in a colon. Include the word *following*
  when natural.
- Tables need labelled columns and concise cells. If a cell exceeds two sentences, the content
  belongs in prose.

### One home per explanation

Each explanation has one home. Everywhere else that depends on it names that home rather than
restating it. Choose the home where the behaviour lives, not where it gets used.

Repetition across audiences is not duplication. A tooltip, a CHANGELOG entry, and a comment can
each carry the same behaviour, because nobody reads them together.

## Register

### Audience awareness

- Match vocabulary and depth to the reader's prior knowledge. The curse of knowledge is the most
  common authoring failure: experts forget what novices do not know.
- Avoid idioms, culture-specific references, and jargon outside the audience's domain. Many
  readers parse English as a second language.
- Show the reader alternatives and leave space for feedback. Do not be more authoritative than
  the evidence supports.
- In user-facing docs, write from the user's side, not the implementation's.

### Literal over stock metaphor

Stock metaphors are fluent but vague. State the literal effect:

| Stock metaphor              | Literal                   |
| --------------------------- | ------------------------- |
| costs no force-push         | force-pushes nothing      |
| surfaces the error          | shows the error           |
| under the hood              | internally                |
| still sits on the server    | is still on the server    |

### Avoid personification

- Avoid personification. Do not pair an inanimate subject with verbs that imply volition, speech,
  perception, or judgement.
- Avoid reflexive phrasing. Name the actor instead.

Code, commands, and processes escape the rule: the reader already reads them as shorthand for the
machine that executes them, as in "`buildModel` returns the rows" or "Pull fast-forwards the
branch". Data never acts. A branch, a count, a file, or a commit gets acted upon.

The following pairs contrast a personified subject with a named actor:

| Personified                                                 | Named actor                                   |
| ----------------------------------------------------------- | --------------------------------------------- |
| The code rewrote itself.                                    | `rebuildStack` rewrites each commit.          |
| The stack decides which branch merges first.                | The author chooses which branch merges first. |
| The trunk row says nothing.                                 | `buildModel` reports no count on the row.     |
| An untracked file stands between the branch and its remote. | Pull refuses while a file is untracked.       |
| Gone outranks a count.                                      | `syncBadge` checks `gone` before the counts.  |
| The count survives a checkout.                              | The count holds after a checkout.             |

Two verbs deserve their own note, because they read as neutral and are not. *Wants* and
*decides* almost always mean a person made a choice — say who.

State-of-being verbs on data are fine ("the badge is amber", "the count holds at two"), and so is
a UI control as actor, since a reader treats a button as the thing that runs the action.

### Compare and contrast

Anchor new ideas to ones the reader already understands. Most ideas are evolutionary, not
revolutionary; explicit comparisons accelerate comprehension and disarm objections.

## Code comments and commit summaries

Code comments and commit summaries have the least room of any prose, so choosing what to say
matters more than polishing how to say it. A comment can follow every rule above and still be
opaque if it opens with the wrong content. Apply the following rules:

- Include only what a reader cannot recover from the code: the reason for the change, and anything
  non-obvious (subtleties, gotchas, effects on other modules). Cut every other sentence, including
  lists of new symbols and step-by-step narration of the implementation.
- Describe the contract, not the call sites. A comment on a shared function states the
  precondition ("while the branch still exists"), not the caller that currently satisfies it.
  Callers change, and nobody updates the comment when they do.
- Open with the question the reader would ask. Next to a similar test or function, that question
  is "why does this exist when the neighbour looks the same?" Answer it by contrast.
- Name the behaviour in domain words first. Introduce internal names, such as a flag like
  `fillable`, only after the reader knows what the behaviour is.
  - Prefer: "The items run out."
  - Avoid:  "The connection is exhausted."
- Anchor a failure mode with one concrete example.
  - Prefer: "Pasting `11\n22\n33` changed one cell instead of three."
  - Avoid:  "Multi-line input was truncated."
- State each fact once. If a clarification overlaps an earlier sentence, rewrite that sentence
  instead of appending another.
- Point to the code that owns a behaviour. A reference back to earlier prose gives the reader
  nothing to search for.
  - Prefer: "`getTargetEntries` returns the prefix that fits; the toast below reports the rest."
  - Avoid:  "Same contract as before."
- Describe bugs at their real severity. A toast that fires for the wrong reason is a misfire.
  - Prefer: "The toast misfires."
  - Avoid:  "The loss was reported via a toast."

## References

- [Google Technical Writing One](https://developers.google.com/tech-writing/one)
- [Google Developer Documentation Style Guide](https://developers.google.com/style)
