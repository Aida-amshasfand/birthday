# Birthday Glow — outcome tracking

## Active approved work

- [x] **Create Deniz’s bilingual birthday experience.** Make the page a romantic, sweet, playful birthday experience for the user's partner Deniz. Present English and Persian. Draft the message based on her being stylish, exceptionally good at makeup, kind, supportive, and smart; her cooking; classic Persian music; and their affectionate nickname “نردولک” (“little nerd”). Show “October 30” only; do not show her age or birth year. Keep the presentation of her bright/colorful and gothic sides open for a later style decision. Do not add a music track until the user supplies its exact link.
- [x] **Keep the public birthday link separate from the editor.** Anyone with the generated, unguessable birthday-page link can view the recipient experience; opening the bare website address does not expose Deniz's content. Only the private editor view exposes personalization controls.
- [x] **Provide exactly two invitation-only editor accounts.** The user and Deniz each use a separate account number and password. Do not allow public sign-up beyond those two invitations. Passwords are protected and stored as password hashes, not readable text.
- [x] **Persist and share the personalized page.** Let either editor update the shared birthday content and options; the public link shows the saved experience when it is saved, without exposing editor controls. The public view includes the animated phrase-filled heart, playback/restart/speed controls, and a reveal. Honor reduced-motion preferences.
- [x] **Provide accessible motion controls and bilingual UI.** Support English and Persian/RTL, keyboard-accessible controls, readable contrast, and visitors' reduced-motion preferences.
- [x] **Prepare a Cloudflare Workers edition.** Serve the frontend as Worker static assets; use D1 for editor accounts, sessions, settings, rate limits, and share token; keep the setup code outside committed source; provide PowerShell commands for local testing and user-run deployment. Do not publish/deploy from this task.
- [ ] **Add “Hamsafar” by Googoosh only after the user provides the exact track link.** Do not source, download, or embed a track until its link is supplied.

## Deferred by the user

- [ ] **Photo gallery and permanent file deletion.** The user has asked to stop gallery work. Do not add photo viewing, upload, storage, or deletion features unless the user asks to resume. The earlier requested future behavior remains: either editor can add or permanently delete uploaded photo files; anyone with the birthday-page link can view them; and removal must physically delete the stored object, not merely hide a gallery record. No personal photos were supplied.

## Original inspiration

- [x] **Adapt the supplied Python turtle/Tkinter idea into an animated heart experience.** Create a responsive page inspired by the multilingual phrase-filled heart, with a celebratory reveal, editable phrases and visual themes, animation playback/restart/speed controls, shareable output, and reduced-motion support.
