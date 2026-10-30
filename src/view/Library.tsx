/**
 * Meeting types and saved requests. A meeting type names the meetings it
 * suits and the sections a meeting's notes are written under; the app has
 * its own, and the person writes more. A saved request is a request to the
 * assistant the person sends often, on a meeting or on all of them, listed
 * in the assistant's `/` menu.
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

interface Request {
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
      <PageTitle>Meeting types</PageTitle>
      {problem && <Notice>{problem}</Notice>}
      {editing ? (
        <>
          <SettingsSection first>{editing.id ? 'Edit meeting type' : 'New meeting type'}</SettingsSection>
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
                  Delete meeting type
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
                New meeting type
              </Button>
            }
          >
            My meeting types
          </SettingsSection>
          {own.length > 0 && (
            <SettingsCard>
              {own.map((t) => (
                <LinkRow key={t.id} title={t.name} onOpen={() => setEditing(t)} />
              ))}
            </SettingsCard>
          )}
          <SettingsSection>Meeting types</SettingsSection>
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

export function RequestsPage({ host }: { host: Host }) {
  const [own, setOwn] = useState<Request[]>([]);
  const [editing, setEditing] = useState<Request | null>(null);
  const [deleting, setDeleting] = useState<Request | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = () =>
    void host.tool<{ requests: Request[] }>('requests').then(({ requests }) => setOwn(requests), (e) => setProblem(words(e)));
  useEffect(load, [host]);

  const save = async () => {
    if (!editing) return;
    setProblem(null);
    try {
      await host.tool(
        'save_request',
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
      <PageTitle>Saved requests</PageTitle>
      {problem && <Notice>{problem}</Notice>}
      {editing ? (
        <>
          <SettingsSection first>{editing.name ? 'Edit request' : 'New request'}</SettingsSection>
          <div className="notes-form">
            <TextField label="Name" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <textarea
              className="hs-in notes-request-text"
              aria-label="What the assistant does"
              placeholder="What the assistant does"
              value={editing.text}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            />
            <div className="notes-form-actions">
              {editing.name && (
                <Button variant="danger" icon={<Icon name="delete-bin-line" size={14} />} onClick={() => setDeleting(editing)}>
                  Delete request
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
        <EmptyState icon={<Icon name="bookmark-line" size={30} />} title="No saved requests yet">
          <Button icon={<Icon name="add-line" size={14} />} onClick={blank}>
            New request
          </Button>
        </EmptyState>
      ) : (
        <>
          <SettingsSection
            first
            action={
              <Button size="sm" icon={<Icon name="add-line" size={14} />} onClick={blank}>
                New request
              </Button>
            }
          >
            My requests
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
            void host.tool('delete_request', { name }, 'Delete').then(load, (e) => setProblem(words(e)));
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Page>
  );
}
