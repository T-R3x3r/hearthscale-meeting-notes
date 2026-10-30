# Developing Meeting notes

`README.md` is the text the Marketplace shows under **About** on the listing of Meeting notes, so it is written for the people who install it. This file is for the people who work on it.

Meeting notes is an ordinary Hearthscale app, built only on the platform's documented API.

## Layout

| Path | What it holds |
| --- | --- |
| `app.json` | The manifest. |
| `backend.ts` | The backend's entry; `hearthscale dev` and `pack` bundle it with `src/backend` and `src/shared`. |
| `src/backend/` | The backend: the meeting files, the recording, the speakers, the notes writer, and what the assistant reads. |
| `src/shared/` | What the backend and the view share: the meeting files' form and the templates. |
| `src/view/` | The view, React on the kit's parts (`@hearthscale/app-ui`). |
| `views/meeting-notes.js` | The view's build, the one file the package carries for it, committed with every change to `src/view`. |
| `prompt/`, `skills/` | The assistant's instructions and its built-in recipes. |

## Build

```sh
pnpm install
pnpm build        # type-checks everything, then builds the view
```

The SDK packages come as files from the pre-release builder kit; `package.json` names them by their path on the developer's computer.

## Where the meetings live

Each meeting is a folder `meetings/<id>/` in the app's data folder, the `data` mount, with Markdown files any program reads (`src/shared/meeting.ts`):

- `meeting.md`: the facts as front matter, one `key: <JSON>` line each, then the title.
- `my-notes.md`: what the person wrote.
- `notes.md`: the written notes; the model's words sit in `<span data-model>`, and `[m:ss](#t<seconds>)` links to the moment of the transcript.
- `transcript.md`: one line per stretch of speech, with a comment Markdown readers hide that holds its number, side, start, end and speaker.

The form only grows. A later version may add keys and files, and must read every file an earlier one wrote, so people keep their meetings across updates. The app store is not used for meetings: it is one JSON file written whole on every change.

The shared index watches `meetings/`, so the assistant searches every saved file.

## Recording

The backend records with `ctx.capture`: the microphone with `echo` and the computer's sound (`system-sound`, where the system gives it), each into a transcription stream of its own (`ctx.models.listen`), so each side's lines come apart as "Me" and "Them". Both captures keep their sound (`keep`); after the meeting a `diarization` job on the side with the voices tells the speakers apart, and the sound is then released. The backend runs as a service, so a recording goes on while the person uses other programs, and the notes are written after a recording that ends with no view open.

## Notes

`src/backend/writer.ts` writes the notes on the app's chat model with `format` (JSON that matches a schema), in one request or, for a transcript longer than the model's window, in parts and a last request that puts the parts' points under headings. The transcript goes to the model as `untrusted` text. The person's lines are kept word for word.

## Working on it

With a Hearthscale platform running on this machine:

```sh
hearthscale dev .
```

links this folder into the running platform and picks up every change. A change of the app replaces its backend, so a recording that runs ends; close and reopen the view's tab to load a new view build.

## Releasing

Install the Hearthscale registry's GitHub App on this repository once. Then every release whose tag equals `version` in `app.json` is picked up by the Marketplace.

```sh
hearthscale pack .
```

builds the package to attach to the release.

## Licence

MIT. See `LICENSE`.
