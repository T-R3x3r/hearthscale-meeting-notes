/**
 * The person's own templates, each a Markdown file `templates/<id>.md` in
 * the app's data folder: the template's facts as front matter, then each
 * section as a heading with the line that says what goes in it.
 */
import type { Section, Template } from './templates.ts';

export const TEMPLATES_FOLDER = 'templates';
export const templatePath = (id: string) => `${TEMPLATES_FOLDER}/${id}.md`;

const FENCE = '---';

export function writeTemplate(t: Template): string {
  const sections = t.sections.map((s) => `## ${s.heading.replace(/\n/g, ' ')}\n\n${s.guide.trim()}\n`);
  return `${FENCE}\nid: ${JSON.stringify(t.id)}\nname: ${JSON.stringify(t.name)}\nabout: ${JSON.stringify(t.about)}\n${FENCE}\n\n${sections.join('\n')}`;
}

export function readTemplate(text: string): Template {
  const lines = text.split(/\r?\n/);
  const facts: Record<string, string> = {};
  let at = 1;
  for (; at < lines.length && lines[at] !== FENCE; at++) {
    const split = lines[at]!.indexOf(': ');
    if (split > 0) facts[lines[at]!.slice(0, split)] = JSON.parse(lines[at]!.slice(split + 2)) as string;
  }
  const sections: Section[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith('## ')) sections.push({ heading: line.slice(3).trim(), guide: '' });
    else if (sections.length > 0 && line.trim()) {
      const last = sections[sections.length - 1]!;
      last.guide = last.guide ? `${last.guide} ${line.trim()}` : line.trim();
    }
  }
  return { id: facts.id!, name: facts.name!, about: facts.about!, sections };
}
