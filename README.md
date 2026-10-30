# Meeting notes

Notes of every meeting, on your own computer. Meeting notes hears both sides of a call, shows every word as people speak, and writes clear notes when the meeting ends. No bot joins the call, and nothing leaves your computer unless you choose a cloud model.

Meeting notes is free and needs no account.

## Get started

Open Meeting notes from the rail and choose **Record**. Write short points under **My notes** while people speak, and choose **Stop** when the meeting ends. Your points and the transcript then become **Notes**, under the sections of a meeting type. Your own words stay as you wrote them; the words the model added are lighter, and the time after them opens the moment of the transcript they came from.

- **Transcript** shows every line as people speak, with who said it and when. Name a speaker once, and every line of theirs takes the name.
- **Ask** answers questions about one meeting, or about all your meetings from the start page.
- **Meeting types** set the sections of the notes, such as a one-on-one or a sales call. Open one to see its sections, use it for a meeting, use it by default, or duplicate it and make it your own.
- **Saved requests** are requests you make often, such as a follow-up mail or the next steps. Type `/` in Ask to use one.
- **Search meetings** finds the meetings whose title, notes or transcript hold the words you type.
- **Transcribe a recording** makes a meeting from a sound file.

When another program starts to use your microphone, such as a call, Meeting notes asks whether to take notes.

## The models it needs

Meeting notes runs on models on your computer:

- **A transcription model**, to hear what people say. Required.
- **A chat model**, to write the notes and answer in Ask. Required. A model of about 4B parameters, such as Qwen3 4B, writes good notes; smaller models often repeat the transcript.
- **A diarization model**, to tell the speakers apart. Optional.
- **An embedding model**, so that Ask finds what you ask about in all your meetings. Optional.

Download them in Hearthscale Server, then choose them in **Settings > Apps > Meeting notes**. If a required model is missing, Meeting notes says so and names that place.

## What Meeting notes asks for

- **Your microphone and the sound your computer plays**, only while it records.
- **Your models**, to transcribe, to find the speakers and to write the notes.
- **To keep running in the background**, so a recording goes on while you use other programs, and the notes are written when it ends.
- **Its own data.** Each meeting is a folder of Markdown files in the app's data folder on this computer. The sound is not kept.
