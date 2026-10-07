import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@wix/api-client';
import { contacts, labels, extendedFields } from '@wix/crm';
import { generateChatReply } from './lib/agentic-service.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const wixClient = createClient({
  modules: { contacts, labels, extendedFields },
  auth: {
    getAuthHeaders: async () => ({
      headers: {
        Authorization: process.env.WIX_API_KEY,
        "wix-site-id": process.env.WIX_SITE_ID
      }
    })
  }
});

function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const MESSAGE_FROM_LANDING_DISPLAY_NAME = 'Message from Landing';
const DEFAULT_LANDING_MESSAGE = 'Interest from Landing Page';

let cachedMessageFromLandingKey = null;

async function getMessageFromLandingFieldKey() {
  if (cachedMessageFromLandingKey) return cachedMessageFromLandingKey;

  try {
    const target = normalizeName(MESSAGE_FROM_LANDING_DISPLAY_NAME);
    const limit = 100;
    let offset = 0;
    const maxPages = 20;

    for (let page = 0; page < maxPages; page += 1) {
      const result = await wixClient.extendedFields.listExtendedFields({
        namespace: 'custom',
        paging: { limit, offset }
      });

      const fields = result?.fields ?? [];
      const match = fields.find((f) => normalizeName(f?.displayName) === target);
      if (match?.key) {
        cachedMessageFromLandingKey = match.key;
        return cachedMessageFromLandingKey;
      }

      const total = result?.metadata?.total ?? 0;
      offset += fields.length;
      if (!fields.length || offset >= total) break;
    }

    console.warn(
      `⚠️ Could not find an extended field named "${MESSAGE_FROM_LANDING_DISPLAY_NAME}" in the custom namespace.`
    );
    return null;
  } catch (error) {
    console.warn(
      `⚠️ Error looking up extended field "${MESSAGE_FROM_LANDING_DISPLAY_NAME}":`,
      error?.message ?? error
    );
    return null;
  }
}

async function findOrCreateLabelKey(displayName) {
  if (!displayName) return null;

  const result = await wixClient.labels.findOrCreateLabel(displayName);
  return result?.label?.key ?? null;
}

async function getExistingLabelKey(displayName) {
  if (!displayName) return null;

  try {
    const result = await wixClient.labels.listLabels();
    const existing = result?.labels?.find(
      (l) => (l?.displayName ?? '').toLowerCase() === displayName.toLowerCase()
    );
    return existing?.key ?? null;
  } catch (error) {
    console.error(`Error looking up label "${displayName}":`, error);
    return null;
  }
}

// Wix rejects creating a contact whose email already exists. Returns the
// existing contact's ID in that case, otherwise null.
function getDuplicateContactId(error) {
  const appError = error?.details?.applicationError;
  if (appError?.code !== 'DUPLICATE_CONTACT_EXISTS') return null;
  return appError?.data?.duplicateContactId ?? null;
}

// Writes the new extended fields (role, message) onto an existing contact,
// leaving its name and email untouched.
async function updateContactExtendedFields(contactId, items) {
  const contact = await wixClient.contacts.getContact(contactId);

  // Keep the contact's other custom fields in case Wix replaces the whole map.
  const existingCustom = Object.fromEntries(
    Object.entries(contact?.info?.extendedFields?.items ?? {}).filter(([key]) =>
      key.startsWith('custom.')
    )
  );

  return wixClient.contacts.updateContact(
    contactId,
    { extendedFields: { items: { ...existingCustom, ...items } } },
    contact.revision
  );
}

app.post('/api/subscribe', async (req, res) => {
  try {
    const { email, firstName, lastName, role, message } = req.body;

    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const messageForCrm = trimmedMessage || DEFAULT_LANDING_MESSAGE;

    const contactInfo = {
      name: {
        first: firstName,
        last: lastName
      },
      emails: {
        items: [
          {
            email: email,
            primary: true
          }
        ]
      }
    };

    // Always include a message so Wix can filter contacts from this landing page.
    contactInfo.extendedFields = { items: {} };

    if (role) {
      contactInfo.extendedFields.items['custom.role'] = role;
    }

    const messageFieldKey = await getMessageFromLandingFieldKey();
    if (messageFieldKey) {
      contactInfo.extendedFields.items[messageFieldKey] = messageForCrm;
    } else {
      // Fallback so the message isn't lost if the field lookup fails.
      contactInfo.extendedFields.items['custom.message'] = messageForCrm;
    }

    let response;
    try {
      response = await wixClient.contacts.createContact(contactInfo);
    } catch (createError) {
      const duplicateContactId = getDuplicateContactId(createError);
      if (!duplicateContactId) throw createError;

      // Returning subscriber: update their existing contact instead.
      response = await updateContactExtendedFields(
        duplicateContactId,
        contactInfo.extendedFields.items
      );
    }
    const contactId = response?.contact?._id;
    if (!contactId) {
      throw new Error('Wix CRM did not return a contact ID.');
    }

    // Label the contact.
    // If labeling fails, we still keep the contact creation successful.
    try {
      const labelKeys = [];
      // Use the existing CRM label (do not create it).
      const landingLabelKey = await getExistingLabelKey('Interest from Landing');
      if (landingLabelKey) labelKeys.push(landingLabelKey);

      if (role) {
        const roleLabelKey = await findOrCreateLabelKey(role);
        if (roleLabelKey) labelKeys.push(roleLabelKey);
      }

      if (labelKeys.length > 0) {
        await wixClient.contacts.labelContact(contactId, labelKeys);
      }
    } catch (labelError) {
      console.error('Error labeling contact:', labelError);
    }

    console.log('Contact saved successfully:', response);
    res.json({ success: true, data: response });
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const reply = await generateChatReply(messages);
    res.json({ reply });
  } catch (error) {
    console.error('Error generating chat reply:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Backend server running on http://localhost:${PORT}`);
});