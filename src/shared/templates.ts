/**
 * The shapes notes can take. A template names the meeting it suits and its
 * sections, each with a line that says what goes in it; Auto lets the model
 * choose the headings that fit the meeting.
 */

export interface Section {
  heading: string;
  guide: string;
}

export interface Template {
  id: string;
  name: string;
  /** What kind of meeting the template suits, for the model that picks
   *  one. */
  about: string;
  /** No sections: the model chooses the headings. */
  sections: Section[];
}

export const AUTO = 'auto';

const section = (heading: string, guide: string): Section => ({ heading, guide });

export const TEMPLATES: Template[] = [
  {
    id: AUTO,
    name: 'Auto',
    about: 'Any meeting.',
    sections: [],
  },
  {
    id: 'one-on-one',
    name: 'One-on-one',
    about: 'Two people who work together talk about work, progress and growth.',
    sections: [
      section('Updates', 'What each person reported since the last time.'),
      section('Problems', 'What blocks or worries them, and the help asked for.'),
      section('Feedback', 'Praise or criticism either person gave.'),
      section('Growth', 'Goals, skills and career.'),
    ],
  },
  {
    id: 'stand-up',
    name: 'Stand-up',
    about: 'A short daily team meeting: what each person did, will do, and what blocks them.',
    sections: [
      section('Done', 'What each person finished, by name.'),
      section('Next', 'What each person does next, by name.'),
      section('Blocked', 'What stops someone, and who helps.'),
    ],
  },
  {
    id: 'team-meeting',
    name: 'Team meeting',
    about: 'A team discusses its work, plans and decisions.',
    sections: [
      section('Topics', 'Each topic the team talked about, in a few words.'),
      section('Decisions', 'What the team agreed, as it was said.'),
      section('Open questions', 'What is still not decided.'),
    ],
  },
  {
    id: 'customer-discovery',
    name: 'Customer discovery',
    about: 'A talk with a customer or user to learn their needs and problems.',
    sections: [
      section('About them', 'Who they are, their role and their company.'),
      section('Problems', 'The problems they have, in their own words.'),
      section('How they work now', 'Tools and ways they use today.'),
      section('What they want', 'What would help them, and what they would pay for.'),
      section('Quotes', 'Sentences they said that matter, word for word.'),
    ],
  },
  {
    id: 'sales-call',
    name: 'Sales call',
    about: 'A call with a possible buyer about a product or service.',
    sections: [
      section('Their needs', 'What the buyer needs and why now.'),
      section('Budget and timing', 'Money, dates and who decides.'),
      section('Questions and doubts', 'What they asked and what holds them back.'),
      section('What we offered', 'Products, prices and terms we named.'),
    ],
  },
  {
    id: 'job-interview',
    name: 'Job interview',
    about: 'An interview with a candidate for a job.',
    sections: [
      section('Background', 'The candidate’s experience and skills.'),
      section('Answers', 'How they answered the main questions.'),
      section('Strengths', 'What speaks for them.'),
      section('Concerns', 'What speaks against them, or needs a check.'),
      section('Their questions', 'What the candidate asked.'),
    ],
  },
  {
    id: 'user-interview',
    name: 'User interview',
    about: 'A research talk with a person who uses or could use a product.',
    sections: [
      section('Context', 'Who they are and how they use the product.'),
      section('What they did', 'Tasks they described or showed, step by step.'),
      section('Pain points', 'Where they had trouble.'),
      section('Ideas', 'What they asked for or suggested.'),
    ],
  },
  {
    id: 'sprint-planning',
    name: 'Sprint planning',
    about: 'A team plans the work of its next sprint.',
    sections: [
      section('Goal', 'The goal of the sprint.'),
      section('Planned work', 'The items taken in, with who does them.'),
      section('Risks', 'What could stop the plan.'),
    ],
  },
  {
    id: 'retrospective',
    name: 'Retrospective',
    about: 'A team looks back at its last period of work.',
    sections: [
      section('Went well', 'What worked.'),
      section('Went badly', 'What did not work.'),
      section('Changes', 'What the team will do differently.'),
    ],
  },
  {
    id: 'investor-update',
    name: 'Investor update',
    about: 'A company reports to its investors or board.',
    sections: [
      section('Numbers', 'Revenue, users, money in the bank and other figures named.'),
      section('Progress', 'What the company did since the last update.'),
      section('Problems', 'What goes badly.'),
      section('Asks', 'The help the company asked for.'),
    ],
  },
  {
    id: 'pitch',
    name: 'Pitch',
    about: 'Someone presents a company, product or idea to win support.',
    sections: [
      section('The idea', 'What was presented, in a few sentences.'),
      section('Market and customers', 'Who it is for and how big it is.'),
      section('Questions', 'What the listeners asked, and the answers.'),
      section('Impression', 'Strong and weak points that came up.'),
    ],
  },
  {
    id: 'class',
    name: 'Class or talk',
    about: 'A lecture, class or talk where one person teaches or presents.',
    sections: [
      section('Main ideas', 'The main ideas, in the order they came.'),
      section('Details', 'Definitions, examples and figures worth keeping.'),
      section('To read or do', 'Tasks, readings and dates named.'),
    ],
  },
];

export const template = (id: string): Template | undefined => TEMPLATES.find((t) => t.id === id);
