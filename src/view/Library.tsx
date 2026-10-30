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
  FactRow,
  Icon,
  LinkRow,
  ListRow,
  MItem,
  MenuSurface,
  Notice,
  PageTitle,
  SettingsCard,
  SettingsSection,
  ShellConfirm,
  TextInput,
  anchorFrom,
  useFloatingTips,
  type MenuAnchor,
} from '@hearthscale/app-ui';
import type { Meeting } from '../shared/meeting.ts';
import { TEMPLATES, type Template } from '../shared/templates.ts';
import { BUILT_IN, OWN, type Request } from '../shared/requests.ts';
import { words, type Host } from './host.ts';
import { Field, IconAction, Page } from './parts.tsx';

const blankTemplate = (): Template => ({ id: '', name: '', about: '', sections: [{ heading: '', guide: '' }] });

export function TemplatesPage({
  host,
  meetings,
  meetingName,
  onUse,
}: {
  host: Host;
  /** The meetings whose notes a meeting type can write. */
  meetings: Meeting[];
  meetingName: (meeting: Meeting) => string;
  /** Writes a meeting's notes with a meeting type, and opens the meeting. */
  onUse: (meeting: string, template: string) => void;
}) {
  const [own, setOwn] = useState<Template[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Template | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [using, setUsing] = useState<MenuAnchor | null>(null);
  const [writing, setWriting] = useState<Meeting | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const tips = useFloatingTips();

  const load = () =>
    void host.tool<{ templates: Template[]; default: string }>('templates').then(({ templates, default: first }) => {
      setOwn(templates);
      setChosen(first);
    }, (e) => setProblem(words(e)));
  useEffect(load, [host]);

  const useByDefault = (id: string) =>
    void host.tool('set_default_template', { id }, 'Use by default').then(load, (e) => setProblem(words(e)));

  const save = async () => {
    if (!editing) return;
    setProblem(null);
    try {
      const { id, ...rest } = editing;
      const { template } = await host.tool<{ template: Template }>('save_template', id ? editing : rest, 'Save');
      setEditing(null);
      setViewing(template);
      load();
    } catch (e) {
      setProblem(words(e));
    }
  };

  const setSection = (i: number, change: Partial<{ heading: string; guide: string }>) =>
    editing &&
    setEditing({ ...editing, sections: editing.sections.map((s, at) => (at === i ? { ...s, ...change } : s)) });

  const mine = viewing !== null && own.some((t) => t.id === viewing.id);
  const useWhy = tips('use', meetings.length === 0 ? 'Record a meeting first' : undefined);
  const saveWhy = tips('save', editing && !editing.name.trim() ? 'Add a name' : undefined);

  return (
    <Page>
      {editing ? (
        <>
          <PageTitle>{editing.id ? 'Edit meeting type' : 'New meeting type'}</PageTitle>
          {problem && <Notice>{problem}</Notice>}
          <div className="notes-form">
            <Field
              id="type-name"
              label="Name"
              placeholder="Board meeting"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <Field
              id="type-about"
              label="Description"
              placeholder="A company reports to its board"
              value={editing.about}
              onChange={(e) => setEditing({ ...editing, about: e.target.value })}
            />
            <div className="notes-sections">
              {editing.sections.length > 0 && (
                <div className="notes-form-row" aria-hidden="true">
                  <span className="hs-field-label">Heading</span>
                  <span className="hs-field-label">Section notes</span>
                </div>
              )}
              {editing.sections.map((s, i) => (
                <div key={i} className="notes-form-row">
                  <TextInput aria-label="Heading" placeholder="Decisions" value={s.heading} onChange={(e) => setSection(i, { heading: e.target.value })} />
                  <TextInput
                    aria-label="Section notes"
                    placeholder="What was agreed, and who owns it"
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
              <span className="hs-flex-spacer" />
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <span className="hs-tipwrap" {...saveWhy.hover}>
                <Button variant="primary" disabled={!editing.name.trim()} onClick={() => void save()}>
                  Save
                </Button>
                {saveWhy.tip}
              </span>
            </div>
          </div>
        </>
      ) : viewing ? (
        <>
          <div className="notes-top">
            <IconAction name="Meeting types" icon="arrow-left-line" onClick={() => setViewing(null)} />
            <PageTitle>{viewing.name}</PageTitle>
          </div>
          {problem && <Notice>{problem}</Notice>}
          <SettingsSection first>Description</SettingsSection>
          <SettingsCard>
            <ListRow title={viewing.about} />
          </SettingsCard>
          <SettingsSection>Sections</SettingsSection>
          <SettingsCard>
            {viewing.sections.length > 0 ? (
              viewing.sections.map((s, i) => <FactRow key={i} label={s.heading} value={s.guide} />)
            ) : (
              <ListRow title="Chosen to fit each meeting" />
            )}
          </SettingsCard>
          <div className="notes-form-actions notes-type-actions">
            {mine && (
              <Button variant="danger" icon={<Icon name="delete-bin-line" size={14} />} onClick={() => setDeleting(viewing)}>
                Delete meeting type
              </Button>
            )}
            <span className="hs-flex-spacer" />
            <Button
              icon={<Icon name="file-copy-line" size={14} />}
              onClick={() => setEditing({ ...viewing, id: '', name: `${viewing.name} copy` })}
            >
              Duplicate
            </Button>
            {mine && (
              <Button icon={<Icon name="pencil-line" size={14} />} onClick={() => setEditing(viewing)}>
                Edit
              </Button>
            )}
            {chosen !== null && viewing.id !== chosen && (
              <Button icon={<Icon name="check-line" size={14} />} onClick={() => useByDefault(viewing.id)}>
                Use by default
              </Button>
            )}
            <span className="hs-tipwrap" {...useWhy.hover}>
              <Button
                variant="primary"
                disabled={meetings.length === 0}
                trailingIcon={<Icon name="arrow-down-s-line" size={14} />}
                onClick={(e) => setUsing(anchorFrom('use', e))}
              >
                Use for a meeting
              </Button>
              {useWhy.tip}
            </span>
          </div>
        </>
      ) : (
        <>
          <PageTitle>Meeting types</PageTitle>
          {problem && <Notice>{problem}</Notice>}
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
          <SettingsCard>
            {own.length > 0 ? (
              own.map((t) => (
                <LinkRow key={t.id} title={t.name} value={t.id === chosen ? 'Default' : undefined} onOpen={() => setViewing(t)} />
              ))
            ) : (
              <ListRow title="No meeting types of your own yet" />
            )}
          </SettingsCard>
          <SettingsSection>Built-in</SettingsSection>
          <SettingsCard>
            {TEMPLATES.map((t) => (
              <LinkRow key={t.id} title={t.name} value={t.id === chosen ? 'Default' : undefined} onOpen={() => setViewing(t)} />
            ))}
          </SettingsCard>
        </>
      )}
      {using && (
        <MenuSurface anchor={using} onDismiss={() => setUsing(null)}>
          {meetings.map((m) => (
            <MItem
              key={m.id}
              label={meetingName(m)}
              onClick={() => {
                setUsing(null);
                setWriting(m);
              }}
            />
          ))}
        </MenuSurface>
      )}
      {writing && viewing && (
        <ShellConfirm
          title={`Write new notes for “${meetingName(writing)}”?`}
          body={null}
          action="Write notes"
          tone="primary"
          onConfirm={() => {
            const meeting = writing.id;
            setWriting(null);
            onUse(meeting, viewing.id);
          }}
          onCancel={() => setWriting(null)}
        />
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
            setViewing(null);
            void host.tool('delete_template', { id }, 'Delete').then(load, (e) => setProblem(words(e)));
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Page>
  );
}

export function RequestsPage({ host }: { host: Host }) {
  const [all, setAll] = useState<Request[]>([]);
  const [viewing, setViewing] = useState<Request | null>(null);
  const [editing, setEditing] = useState<Request | null>(null);
  const [deleting, setDeleting] = useState<Request | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = () =>
    void host.tool<{ requests: Request[] }>('requests').then(({ requests }) => setAll(requests), (e) => setProblem(words(e)));
  useEffect(load, [host]);

  const own = all.filter((r) => r.name.startsWith(OWN));
  const mine = viewing !== null && viewing.name.startsWith(OWN);
  const tips = useFloatingTips();
  const missing = editing ? [!editing.title.trim() && 'a name', !editing.text.trim() && 'a request'].filter(Boolean) : [];
  const saveWhy = tips('save', missing.length > 0 ? `Add ${missing.join(' and ')}` : undefined);

  const save = async () => {
    if (!editing) return;
    setProblem(null);
    try {
      const { name } = await host.tool<{ name: string }>(
        'save_request',
        { ...(editing.name && { name: editing.name }), title: editing.title, text: editing.text },
        'Save',
      );
      setEditing(null);
      setViewing({ ...editing, name });
      load();
    } catch (e) {
      setProblem(words(e));
    }
  };

  const blank = () => setEditing({ name: '', title: '', description: '', text: '' });

  return (
    <Page>
      {editing ? (
        <>
          <PageTitle>{editing.name ? 'Edit request' : 'New request'}</PageTitle>
          {problem && <Notice>{problem}</Notice>}
          <div className="notes-form">
            <Field
              id="request-name"
              label="Name"
              placeholder="Board summary"
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
            <div className="hs-text-field">
              <label htmlFor="request-text" className="hs-field-label">
                Request
              </label>
              <textarea
                id="request-text"
                className="hs-input notes-request-text"
                placeholder="Sum up the decisions and the open questions for the board"
                value={editing.text}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              />
            </div>
            <div className="notes-form-actions">
              <span className="hs-flex-spacer" />
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <span className="hs-tipwrap" {...saveWhy.hover}>
                <Button variant="primary" disabled={!editing.title.trim() || !editing.text.trim()} onClick={() => void save()}>
                  Save
                </Button>
                {saveWhy.tip}
              </span>
            </div>
          </div>
        </>
      ) : viewing ? (
        <>
          <div className="notes-top">
            <IconAction name="Saved requests" icon="arrow-left-line" onClick={() => setViewing(null)} />
            <PageTitle>{viewing.title}</PageTitle>
          </div>
          {problem && <Notice>{problem}</Notice>}
          <SettingsSection first>Request</SettingsSection>
          <SettingsCard>
            <ListRow title={viewing.text} />
          </SettingsCard>
          <div className="notes-form-actions notes-type-actions">
            {mine && (
              <Button variant="danger" icon={<Icon name="delete-bin-line" size={14} />} onClick={() => setDeleting(viewing)}>
                Delete request
              </Button>
            )}
            <span className="hs-flex-spacer" />
            <Button
              icon={<Icon name="file-copy-line" size={14} />}
              onClick={() => setEditing({ ...viewing, name: '', title: `${viewing.title} copy` })}
            >
              Duplicate
            </Button>
            {mine && (
              <Button icon={<Icon name="pencil-line" size={14} />} onClick={() => setEditing(viewing)}>
                Edit
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <PageTitle>Saved requests</PageTitle>
          {problem && <Notice>{problem}</Notice>}
          <SettingsSection
            first
            action={
              <Button size="sm" icon={<Icon name="add-line" size={14} />} onClick={blank}>
                New request
              </Button>
            }
          >
            My saved requests
          </SettingsSection>
          <SettingsCard>
            {own.length > 0 ? (
              own.map((r) => (
                <LinkRow key={r.name} title={r.title} onOpen={() => setViewing(r)} />
              ))
            ) : (
              <ListRow title="No saved requests of your own yet" />
            )}
          </SettingsCard>
          <SettingsSection>Built-in</SettingsSection>
          <SettingsCard>
            {BUILT_IN.map((r) => (
              <LinkRow key={r.name} title={r.title} onOpen={() => setViewing(r)} />
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
            setViewing(null);
            void host.tool('delete_request', { name }, 'Delete').then(load, (e) => setProblem(words(e)));
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Page>
  );
}
