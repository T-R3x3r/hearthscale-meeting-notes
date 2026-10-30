/**
 * The person's own templates and recipes. A template names the meeting it
 * suits and its sections, each with a line that says what goes in it; the
 * notes of a meeting can be written with it. A recipe is a request the
 * assistant runs on a meeting or on all of them, listed in its `/` menu.
 */
import { useEffect, useState } from 'react';
import { Button, Icon, IconButton, PageTitle, ShellConfirm, TextField, TextInput } from '@hearthscale/app-ui';
import { TEMPLATES, type Template } from '../shared/templates.ts';
import { words, type Host } from './host.ts';

interface Recipe {
  name: string;
  title: string;
  text: string;
}

const blankTemplate = (): Template => ({ id: '', name: '', about: '', sections: [{ heading: '', guide: '' }] });

export function TemplatesPage({ host }: { host: Host }) {
  const [own, setOwn] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = () =>
    void host.tool<{ templates: Template[] }>('templates').then(({ templates }) => setOwn(templates), (e) => setProblem(words(e)));
  useEffect(load, [host]);

  const save = async () => {
    if (!editing) return;
    setProblem(null);
    try {
      const { id, ...rest } = editing;
      await host.tool('save_template', id ? editing : rest, 'Save');
      setEditing(null);
      load();
    } catch (e) {
      setProblem(words(e));
    }
  };

  const setSection = (i: number, change: Partial<{ heading: string; guide: string }>) =>
    editing &&
    setEditing({ ...editing, sections: editing.sections.map((s, at) => (at === i ? { ...s, ...change } : s)) });

  return (
    <main className="hs-scroll notes-page">
      <div className="notes-sheet">
        <div className="notes-top">
          <PageTitle>Templates</PageTitle>
          <span className="hs-flex-spacer" />
          {!editing && (
            <Button icon={<Icon name="add-line" size={14} />} onClick={() => setEditing(blankTemplate())}>
              New template
            </Button>
          )}
        </div>
        {problem && <div className="hs-notice">{problem}</div>}
        {editing ? (
          <div className="notes-form">
            <TextField label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <TextField
              label="Meeting it suits"
              value={editing.about}
              onChange={(e) => setEditing({ ...editing, about: e.target.value })}
            />
            {editing.sections.map((s, i) => (
              <div key={i} className="notes-form-row">
                <TextInput aria-label="Heading" placeholder="Heading" value={s.heading} onChange={(e) => setSection(i, { heading: e.target.value })} />
                <TextInput
                  aria-label="What goes in it"
                  placeholder="What goes in it"
                  value={s.guide}
                  onChange={(e) => setSection(i, { guide: e.target.value })}
                />
                <IconButton
                  aria-label="Remove section"
                  onClick={() => setEditing({ ...editing, sections: editing.sections.filter((_, at) => at !== i) })}
                >
                  <Icon name="close-line" size={16} />
                </IconButton>
              </div>
            ))}
            <div className="notes-form-actions">
              <Button
                icon={<Icon name="add-line" size={14} />}
                onClick={() => setEditing({ ...editing, sections: [...editing.sections, { heading: '', guide: '' }] })}
              >
                Add section
              </Button>
              <span className="hs-flex-spacer" />
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!editing.name.trim()} onClick={() => void save()}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            {own.map((t) => (
              <div key={t.id} className="notes-item">
                <span className="notes-item-name">{t.name}</span>
                <span className="hs-flex-spacer" />
                <IconButton aria-label="Edit template" onClick={() => setEditing(t)}>
                  <Icon name="pencil-line" size={16} />
                </IconButton>
                <IconButton aria-label="Delete template" onClick={() => setDeleting(t)}>
                  <Icon name="delete-bin-line" size={16} />
                </IconButton>
              </div>
            ))}
            <h2 className="notes-heading">Built in</h2>
            {TEMPLATES.map((t) => (
              <div key={t.id} className="notes-item" data-built-in="true">
                <span className="notes-item-name">{t.name}</span>
              </div>
            ))}
          </>
        )}
      </div>
      {deleting && (
        <ShellConfirm
          title={`Delete “${deleting.name}”?`}
          body={null}
          action="Delete"
          tone="danger"
          onConfirm={() => {
            const id = deleting.id;
            setDeleting(null);
            void host.tool('delete_template', { id }, 'Delete').then(load, (e) => setProblem(words(e)));
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </main>
  );
}

export function RecipesPage({ host }: { host: Host }) {
  const [own, setOwn] = useState<Recipe[]>([]);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [deleting, setDeleting] = useState<Recipe | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = () =>
    void host.tool<{ recipes: Recipe[] }>('recipes').then(({ recipes }) => setOwn(recipes), (e) => setProblem(words(e)));
  useEffect(load, [host]);

  const save = async () => {
    if (!editing) return;
    setProblem(null);
    try {
      await host.tool(
        'save_recipe',
        { ...(editing.name && { name: editing.name }), title: editing.title, text: editing.text },
        'Save',
      );
      setEditing(null);
      load();
    } catch (e) {
      setProblem(words(e));
    }
  };

  return (
    <main className="hs-scroll notes-page">
      <div className="notes-sheet">
        <div className="notes-top">
          <PageTitle>Recipes</PageTitle>
          <span className="hs-flex-spacer" />
          {!editing && (
            <Button icon={<Icon name="add-line" size={14} />} onClick={() => setEditing({ name: '', title: '', text: '' })}>
              New recipe
            </Button>
          )}
        </div>
        {problem && <div className="hs-notice">{problem}</div>}
        {editing ? (
          <div className="notes-form">
            <TextField label="Name" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <textarea
              className="hs-in notes-recipe-text"
              aria-label="What the assistant does"
              placeholder="What the assistant does"
              value={editing.text}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            />
            <div className="notes-form-actions">
              <span className="hs-flex-spacer" />
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!editing.title.trim() || !editing.text.trim()} onClick={() => void save()}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          own.map((r) => (
            <div key={r.name} className="notes-item">
              <span className="notes-item-name">{r.title}</span>
              <span className="notes-item-key">/{r.name}</span>
              <span className="hs-flex-spacer" />
              <IconButton aria-label="Edit recipe" onClick={() => setEditing(r)}>
                <Icon name="pencil-line" size={16} />
              </IconButton>
              <IconButton aria-label="Delete recipe" onClick={() => setDeleting(r)}>
                <Icon name="delete-bin-line" size={16} />
              </IconButton>
            </div>
          ))
        )}
      </div>
      {deleting && (
        <ShellConfirm
          title={`Delete “${deleting.title}”?`}
          body={null}
          action="Delete"
          tone="danger"
          onConfirm={() => {
            const name = deleting.name;
            setDeleting(null);
            void host.tool('delete_recipe', { name }, 'Delete').then(load, (e) => setProblem(words(e)));
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </main>
  );
}
