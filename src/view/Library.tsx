/**
 * The person's own templates and recipes. A template names the meeting it
 * suits and its sections, each with a line that says what goes in it; the
 * notes of a meeting can be written with it. A recipe is a request the
 * assistant runs on a meeting or on all of them, listed in its `/` menu.
 */
import { useEffect, useState } from 'react';
import {
  Button,
  EmptyState,
  Icon,
  LinkRow,
  ListRow,
  Mono,
  Notice,
  PageTitle,
  SettingsCard,
  SettingsSection,
  ShellConfirm,
  TextField,
  TextInput,
} from '@hearthscale/app-ui';
import { TEMPLATES, type Template } from '../shared/templates.ts';
import { words, type Host } from './host.ts';
import { IconAction, Page } from './parts.tsx';

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
    <Page>
      <PageTitle>Templates</PageTitle>
      {problem && <Notice>{problem}</Notice>}
      {editing ? (
        <>
          <SettingsSection first>{editing.id ? 'Edit template' : 'New template'}</SettingsSection>
          <div className="notes-form">
            <TextField label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <TextField
              label="Meeting it suits"
              value={editing.about}
              onChange={(e) => setEditing({ ...editing, about: e.target.value })}
            />
            <div className="notes-sections">
              {editing.sections.length > 0 && (
                <div className="notes-form-row" aria-hidden="true">
                  <span className="hs-field-label">Heading</span>
                  <span className="hs-field-label">What goes in it</span>
                </div>
              )}
              {editing.sections.map((s, i) => (
                <div key={i} className="notes-form-row">
                  <TextInput aria-label="Heading" placeholder="Heading" value={s.heading} onChange={(e) => setSection(i, { heading: e.target.value })} />
                  <TextInput
                    aria-label="What goes in it"
                    placeholder="What goes in it"
                    value={s.guide}
                    onChange={(e) => setSection(i, { guide: e.target.value })}
                  />
                  <IconAction
                    name="Remove section"
                    icon="close-line"
                    onClick={() => setEditing({ ...editing, sections: editing.sections.filter((_, at) => at !== i) })}
                  />
                </div>
              ))}
            </div>
            <div className="notes-form-actions">
              <Button
                icon={<Icon name="add-line" size={14} />}
                onClick={() => setEditing({ ...editing, sections: [...editing.sections, { heading: '', guide: '' }] })}
              >
                Add section
              </Button>
            </div>
            <div className="notes-form-actions">
              {editing.id && (
                <Button variant="danger" icon={<Icon name="delete-bin-line" size={14} />} onClick={() => setDeleting(editing)}>
                  Delete template
                </Button>
              )}
              <span className="hs-flex-spacer" />
              <Button onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!editing.name.trim()} onClick={() => void save()}>
                Save
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <SettingsSection
            first
            action={
              <Button size="sm" icon={<Icon name="add-line" size={14} />} onClick={() => setEditing(blankTemplate())}>
                New template
              </Button>
            }
          >
            Your templates
          </SettingsSection>
          {own.length > 0 && (
            <SettingsCard>
              {own.map((t) => (
                <LinkRow key={t.id} title={t.name} onOpen={() => setEditing(t)} />
              ))}
            </SettingsCard>
          )}
          <SettingsSection>Built in</SettingsSection>
          <SettingsCard>
            {TEMPLATES.map((t) => (
              <ListRow key={t.id} title={t.name} />
            ))}
          </SettingsCard>
        </>
      )}
      {deleting && (
        <ShellConfirm
          title={`Delete “${deleting.name}”?`}
          body={null}
          action="Delete"
          tone="danger"
          onConfirm={() => {
            const id = deleting.id;
            setDeleting(null);
            setEditing(null);
            void host.tool('delete_template', { id }, 'Delete').then(load, (e) => setProblem(words(e)));
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Page>
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

  const blank = () => setEditing({ name: '', title: '', text: '' });

  return (
    <Page>
      <PageTitle>Recipes</PageTitle>
      {problem && <Notice>{problem}</Notice>}
      {editing ? (
        <>
          <SettingsSection first>{editing.name ? 'Edit recipe' : 'New recipe'}</SettingsSection>
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
              {editing.name && (
                <Button variant="danger" icon={<Icon name="delete-bin-line" size={14} />} onClick={() => setDeleting(editing)}>
                  Delete recipe
                </Button>
              )}
              <span className="hs-flex-spacer" />
              <Button onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!editing.title.trim() || !editing.text.trim()} onClick={() => void save()}>
                Save
              </Button>
            </div>
          </div>
        </>
      ) : own.length === 0 ? (
        <EmptyState icon={<Icon name="quill-pen-line" size={30} />} title="No recipes yet">
          <Button icon={<Icon name="add-line" size={14} />} onClick={blank}>
            New recipe
          </Button>
        </EmptyState>
      ) : (
        <>
          <SettingsSection
            first
            action={
              <Button size="sm" icon={<Icon name="add-line" size={14} />} onClick={blank}>
                New recipe
              </Button>
            }
          >
            Your recipes
          </SettingsSection>
          <SettingsCard>
            {own.map((r) => (
              <LinkRow
                key={r.name}
                title={
                  <>
                    {r.title} <Mono>/{r.name}</Mono>
                  </>
                }
                onOpen={() => setEditing(r)}
              />
            ))}
          </SettingsCard>
        </>
      )}
      {deleting && (
        <ShellConfirm
          title={`Delete “${deleting.title}”?`}
          body={null}
          action="Delete"
          tone="danger"
          onConfirm={() => {
            const name = deleting.name;
            setDeleting(null);
            setEditing(null);
            void host.tool('delete_recipe', { name }, 'Delete').then(load, (e) => setProblem(words(e)));
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Page>
  );
}
