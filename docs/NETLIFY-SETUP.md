# Connecting Netlify — private preview

For Giles. About 20 minutes. Nothing here makes the site public.

**Two secrets** will be created in Netlify and nowhere else. Never put them in the
repository, an email, a chat, a screenshot, or a document:
- **Preview password**: anyone you invite types it to see the site.
- **Moderation key**: 32+ random characters; only you use it, on `/field/moderate/`.

Let a password manager generate both and keep them there.

The site is **closed by default**: if it deploys before the secrets are in place, it
shows "not public yet" to everyone. It only becomes public when a separate
`PUBLIC_LAUNCH` setting is added at an approved launch. Don't add that now.

## 1. Create the project

1. Sign in at **app.netlify.com** (sign up with your GitHub account if you don't have one).
2. **Add new project → Import an existing project → GitHub.** Authorise Netlify if asked,
   and give it access to **GMcCrary3/gcmc3**.
3. Choose **gcmc3**.
4. **Branch to deploy:** `claude/gilesmccrary-website-2ingnt`.
5. Leave the build settings as Netlify fills them in (they come from the repository:
   build command `npm run build`, publish directory `dist`).
6. **Project name:** anything; it becomes `<name>.netlify.app`.
7. Before pressing Deploy, open **Add environment variables** (if this screen doesn't
   offer it, deploy anyway — the site stays closed — and do step 2 straight after).

## 2. Add the secrets

In the project: **Project configuration → Environment variables → Add a variable**
(or on the import screen). For each, choose **all scopes** and **same value for all deploy
contexts**; if Netlify offers **"Contains secret values"**, tick it.

| Key | Value |
|---|---|
| `PRELAUNCH_PASSWORD` | the preview password |
| `FIELD_ADMIN_TOKEN` | the moderation key (32+ characters) |

Do **not** add `PUBLIC_LAUNCH`. Then **Deploys → Trigger deploy → Deploy project**, and
wait for it to say **Published**.

**Check:** open `https://<name>.netlify.app` in a private window. The browser should ask
for a username and password. Any username works; use the preview password.

## 3. Contact form

1. **Project configuration → Forms → Enable form detection**, then trigger a deploy again.
2. **Forms → Form notifications → Add notification → Email notification** → your address,
   form `contact`.

## 4. The editor (`/admin/`)

1. On GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**.
   - Application name: `GilesMcCrary.com editor`
   - Homepage URL: `https://<name>.netlify.app`
   - Authorization callback URL: `https://api.netlify.com/auth/done`
   Register it, then **Generate a new client secret**.
2. In Netlify: **Project configuration → Access & security → OAuth → Install provider →
   GitHub**, paste the Client ID and Client secret. (These are credentials too: paste them
   only into Netlify.)

## 5. Verification

Two options. Either way, no secret goes into a chat.

**A. Let a Claude session run it.** In the cloud environment settings (the environment
menu in the session's title bar → Edit):
- **Network access:** add `<name>.netlify.app` under allowed domains (keep "allow package
  managers" ticked);
- **Environment variables / secrets:** `FIELD_VERIFY_KEY` = the moderation key,
  `FIELD_VERIFY_PASSWORD` = the preview password.
Then start a **new session** on this repository and say "run the field verification
against https://<name>.netlify.app". The session reads the secrets without seeing them
typed, and the script never prints them.

**B. Run it yourself** (needs Node 22): clone the repository, `npm install`, then
```
FIELD_VERIFY_KEY='…' FIELD_VERIFY_PASSWORD='…' node scripts/field-verify.mjs https://<name>.netlify.app
```
(a leading space before the command keeps it out of most shell histories).

## 6. By hand, on the preview

- **Editor:** open `/admin/`, enter the preview password, **Login with GitHub**. Edit
  *settings → site settings → search & sharing description* (add a word), **Save**, then
  **Publish** (set status to Ready, then Publish now). Within a couple of minutes the
  change should appear on GitHub as a commit on the branch, and a new deploy should start.
  Then undo the edit the same way.
- **Contact form:** send a message from `/contact/`; it should appear under **Forms →
  contact** and arrive by email.
- **Moderation:** open `/field/moderate/`, enter the moderation key; the health line
  should read "filing healthy".

When all of that passes, the private preview is verified. Public launch is a separate,
later decision (docs/LAUNCH-CHECKLIST.md, step 11).
