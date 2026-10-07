# Contact form fixes

Start from commit `62b5f3e`. Backend: `netlify/functions/subscribe.mjs` (prod) and `server/index.js` (local dev), both talking to Wix.

1. **Repeat email breaks the form.** Submitting with an email already in the Wix CRM returns a 500, because Wix rejects it as a duplicate contact.
   Fix: when the contact already exists, update it instead of failing.

2. **Messages are hard to find.** The form's message is only stored in a custom contact field.
   Fix: also post each submission into the contact's Wix Inbox conversation. Keep the custom field.

3. **Resubmitting overwrites the message field.** A second submission replaces the earlier message.
   Fix: keep the newest message in the field, using the same field name ("Message from Landing").

4. **Signups aren't on the mailing list.** Form contacts stay "Never subscribed" in Wix email marketing, even though the form says "Join our mailing list".
   Fix: mark each signup as subscribed in Wix.

5. **Unhelpful error message.** On failure the form shows a generic "Error subscribing. Please try again."
   Fix: show a message asking them to email laura@effectivetogreat.com directly instead.

6. **Indentation in `subscribe.mjs`** uses non-breaking spaces instead of regular spaces.
   Fix: convert them to regular spaces.

7. **Labeling code isn't needed.** The "Interest from Landing Page" segment already groups signups.
   Fix: remove the labeling code.
