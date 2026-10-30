/**
 * Saved requests: requests to the assistant a person makes often, which
 * the `/` menu of Ask lists. The app has its own, below, and the person
 * saves more. Each is a skill of the app's agent: its title names it in
 * the menu, its description says what the person gets and tells the agent
 * when to use it, and its text is what the agent does.
 */

export interface Request {
  /** The skill's name; the person's own start with `my-`. */
  name: string;
  title: string;
  description: string;
  text: string;
}

/** The prefix of the names of the person's own requests. */
export const OWN = 'my-';

export const BUILT_IN: Request[] = [
  {
    name: 'what-did-i-miss',
    title: 'Catch me up',
    description: 'What was said in the last minutes of a meeting that runs or just ended.',
    text: 'Read the transcript of the meeting from the end backwards. Tell me in three to five points what was said in the last minutes, with the time of each point. Name decisions and questions to me first.',
  },
  {
    name: 'next-steps',
    title: 'List the next steps',
    description: 'The next steps or to-dos of a meeting, with who does each and by when.',
    text: 'Read the notes and the transcript of the meeting. List each next step as a checkbox line: what, who and by when, as the meeting said it. Write "not said" where the meeting named no one or no date. Leave out what was only an idea.',
  },
  {
    name: 'decisions',
    title: 'List the decisions',
    description: 'What a meeting decided, with the time of each decision.',
    text: 'Read the transcript of the meeting. List each decision people agreed on, with the time it was made. Keep apart what was decided and what was only proposed.',
  },
  {
    name: 'follow-up-mail',
    title: 'Write a follow-up mail',
    description: 'A short mail after a meeting, with its decisions and next steps.',
    text: 'Read the notes of the meeting. Write a short mail to the people of the meeting: thank them in one sentence, list the decisions and the next steps with who does each and when, and end with one line. Use only what the notes and the transcript say. Give the subject on the first line as "Subject: ...". I send it myself.',
  },
  {
    name: 'recap-for-a-channel',
    title: 'Write a team recap',
    description: 'A recap of a meeting in at most five lines, to post for a team.',
    text: 'Read the notes of the meeting. Write a recap of at most five lines for a team chat: one line on what the meeting was about, then the decisions and next steps. No greeting. I post it myself.',
  },
  {
    name: 'open-items',
    title: 'List open items',
    description: 'The next steps of recent meetings that are still open.',
    text: 'Read the notes of the meetings of the last two weeks. Collect the next steps that no later meeting marks as done, grouped by meeting, with who does each.',
  },
  {
    name: 'prepare-me',
    title: 'Prepare me',
    description: 'What to know before a meeting with someone or about something.',
    text: 'Find my earlier meetings with the same people or on the same topic, and read them. Give me three to five points: what was discussed last time, what is still open, and what I promised. Name the meeting and date of each point.',
  },
  {
    name: 'coach-me',
    title: 'Coach me',
    description: 'Feedback on how you did in a meeting.',
    text: 'Read the transcript of the meeting and look at what I said. Give two things I did well and two things to do better next time, each with a moment of the transcript as an example. Be kind and concrete.',
  },
];
