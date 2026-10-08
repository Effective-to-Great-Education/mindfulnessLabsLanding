// Contact form ("Join our mailing list") logic, shared by the Netlify function
// (netlify/functions/subscribe.mjs) and the local dev server (server/index.js).
// Saves the submitter as a Wix contact, subscribes them to Wix email marketing,
// and posts the submission into their Wix Inbox conversation.

const MESSAGE_FIELD_NAME = 'Message from Landing';
const DEFAULT_MESSAGE = 'Interest from Landing Page';

// Calls a Wix REST endpoint and returns the parsed JSON. Throws on any non-2xx,
// attaching the parsed error body as `err.data` so callers can inspect it.
async function wix(method, path, body) {
  const res = await fetch(`https://www.wixapis.com${path}`, {
    method,
    headers: {
      Authorization: process.env.WIX_API_KEY,
      'wix-site-id': process.env.WIX_SITE_ID,
      'Content-Type': 'application/json',
    },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(`Wix ${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
    err.data = data;
    throw err;
  }
  return data;
}

// Finds the key (e.g. "custom.message-from-landing") of the "Message from Landing"
// custom field by its display name. Cached for as long as the process stays warm.
let messageFieldKey = null;
async function getMessageFieldKey() {
  if (messageFieldKey) return messageFieldKey;

  // Page through the site's custom fields, 100 at a time, until we find it
  let offset = 0;
  while (true) {
    const { fields = [], metadata } = await wix(
      'GET',
      `/contacts/v4/extended-fields?namespace=custom&paging.limit=100&paging.offset=${offset}`
    );
    const match = fields.find(
      (f) => f.displayName?.trim().toLowerCase() === MESSAGE_FIELD_NAME.toLowerCase()
    );
    if (match) return (messageFieldKey = match.key);

    offset += fields.length;
    if (!fields.length || offset >= (metadata?.total ?? 0)) break;
  }

  // No fallback field: the message must always land in "Message from Landing"
  throw new Error(`Wix custom field "${MESSAGE_FIELD_NAME}" not found`);
}

// Creates the contact, or updates it if a contact with this email already
// exists. Returns the contact ID.
async function saveContact({ name, email, customFields }) {
  try {
    // New email: create the contact
    const { contact } = await wix('POST', '/contacts/v4/contacts', {
      info: {
        name,
        emails: { items: [{ email, primary: true }] },
        extendedFields: { items: customFields },
      },
    });
    return contact.id;
  } catch (err) {
    // Only "email already exists" is recoverable; anything else is a real failure
    const appError = err.data?.details?.applicationError;
    if (appError?.code !== 'DUPLICATE_CONTACT_EXISTS') throw err;
    const contactId = appError.data.duplicateContactId;

    // Fetch the existing contact for its revision (required to update) and custom fields
    const { contact } = await wix('GET', `/contacts/v4/contacts/${contactId}`);
    const existingCustomFields = Object.fromEntries(
      Object.entries(contact.info?.extendedFields?.items ?? {}).filter(([key]) =>
        key.startsWith('custom.')
      )
    );

    // Update name + custom fields. Existing custom fields are re-sent so none get
    // wiped; ours (role, newest message) overwrite their previous values.
    await wix('PATCH', `/contacts/v4/contacts/${contactId}`, {
      revision: contact.revision,
      info: { name, extendedFields: { items: { ...existingCustomFields, ...customFields } } },
    });
    return contactId;
  }
}

// Handles one form submission end to end. Throws if any step fails.
export async function subscribeContact({ email, firstName, lastName, role, message }) {
  if (!process.env.WIX_API_KEY || !process.env.WIX_SITE_ID) {
    throw new Error('Missing WIX_API_KEY or WIX_SITE_ID environment variables');
  }

  // A blank message gets a default so the "Message from Landing" field
  // (which the landing page segment relies on) is never empty
  const messageText = (typeof message === 'string' && message.trim()) || DEFAULT_MESSAGE;

  // Create or update the contact; "Message from Landing" always holds the newest message
  const customFields = { [await getMessageFieldKey()]: messageText };
  if (role) customFields['custom.role'] = role;
  const contactId = await saveContact({
    name: { first: firstName, last: lastName },
    email,
    customFields,
  });

  // Mark the email as subscribed in Wix email marketing (creates the subscription if missing)
  await wix('POST', '/email-marketing/v1/email-subscriptions', {
    subscription: { email, subscriptionStatus: 'SUBSCRIBED' },
  });

  // Get (or start) the contact's Inbox conversation
  const { conversation } = await wix('POST', '/inbox/v2/conversations', {
    participantId: { contactId },
  });

  // Post the submission into it as a form message from the contact, visible to the business only
  await wix('POST', '/inbox/v2/messages', {
    conversationId: conversation.id,
    sendAs: 'PARTICIPANT',
    message: {
      direction: 'PARTICIPANT_TO_BUSINESS',
      visibility: 'BUSINESS',
      content: {
        previewText: messageText.slice(0, 256),
        form: {
          title: 'Landing page contact form',
          fields: [
            { name: 'Name', value: `${firstName ?? ''} ${lastName ?? ''}`.trim() },
            { name: 'Email', value: email },
            { name: 'Role', value: role },
            { name: 'Message', value: messageText },
          ].filter((f) => f.value),
        },
      },
    },
  });

  console.log('Contact saved successfully:', contactId);
  return contactId;
}
