# Meeting notes

Record a meeting from your microphone in a Hearthscale tab, and keep its
transcript beside your own notes. The transcription runs on this
computer's transcription model, through the Hearthscale Server.

Meeting notes is an ordinary Hearthscale app. Nothing in the platform
knows its name; it installs from the Marketplace like any other app.

## The view

The app shows one view, `meetings`, which fills its tab: the meetings in a
sidebar with New meeting, and the open meeting beside them with its
title, Record and Stop, the transcript and the notes. A narrow tab shows
the list or the meeting. Its source is React under `ui/src`, drawn with
the `hs-*` classes and `ri-*` icons of the kit that Hearthscale loads into
every view. Its build writes `views/meeting-notes.js`, the one file the
package carries for it, so the file is committed with every change to the
source:

```
cd ui
pnpm install
pnpm build
```

## The microphone

`app.json` names `microphone` in `permissions`, a consent fact on the
enable card. The view opens the microphone with `getUserMedia` while it
records, and closes it on Stop; a view whose app does not name it gets no
sound. Recording needs the view on screen: the app records nothing in the
background and no sound of other programs.

## From a recording to a transcript

1. The view takes the sound at 16 kHz in one channel, the form the
   Server's transcription takes, and writes it as WAV files of at most ten
   minutes each, because a view hands the platform at most 64 MiB at once.
2. Each file goes to the platform as an asset of the app
   (`hearthscale/ui/upload-file`).
3. A `transcription` job runs on each file in turn (`hearthscale/jobs/*`,
   through `uses: jobs`), on the transcription model set for the app or
   for the role. The transcript of each part is kept as it comes.

The job under way is kept with the meeting, so a view that opens again
follows it. With no transcription model, the platform refuses the job in
words, the view shows them, and Transcribe again tries once more after a
model is set. The transcription is batch: the transcript shows after Stop,
not while the meeting runs.

## Where the meetings live

In the app's store, through the `store` extension: the list under
`meetings`, newest first, each meeting under `meeting:<id>` (its title,
its length, its recording's assets, the transcript of each part, the job
under way, why the last one stopped, and the notes), and the meeting open
last under `open`. A change is kept half a second after the typing stops.

## Working on it

With a Hearthscale platform running on this machine:

```
hearthscale dev .
```

links this folder into the running platform, picks up every change, and
asks once in the window before any code runs.

## Releasing

Install the Hearthscale registry's GitHub App on this repository once. Then
every release whose tag equals `version` in `app.json` is picked up by the
Marketplace.

```
hearthscale pack .
```

builds the package to attach to the release.

## Licence

MIT. See `LICENSE`.
