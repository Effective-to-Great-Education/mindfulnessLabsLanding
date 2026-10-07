const WIX_API_BASE = 'https://www.wixapis.com/contacts/v4';

const wixHeaders = (apiKey, siteId) => ({
  Authorization: apiKey,
  'wix-site-id': siteId,
  'Content-Type': 'application/json',
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function jsonResponse(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: corsHeaders,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const MESSAGE_FROM_LANDING_DISPLAY_NAME = 'Message from Landing';
const DEFAULT_LANDING_MESSAGE = 'Interest from Landing Page';

let cachedMessageFromLandingKey = null;

async function getMessageFromLandingFieldKey(authHeaders) {
  if (cachedMessageFromLandingKey) return cachedMessageFromLandingKey;

  try {
    const target = normalizeName(MESSAGE_FROM_LANDING_DISPLAY_NAME);
    const limit = 100;
    let offset = 0;
    const maxPages = 20;

    for (let page = 0; page < maxPages; page++) {
      const res = await fetch(
        `https://www.wixapis.com/contacts/v4/extended-fields?namespace=custom&paging.limit=${limit}&paging.offset=${offset}`,
        { method: 'GET', headers: authHeaders }
      );

      if (!res.ok) {
        console.warn('Extended fields lookup failed:', res.status, await res.text());
        return null;
      }

      const data = await res.json();
      const fields = data?.fields ?? [];
      const match = fields.find((f) => normalizeName(f?.displayName) === target);

      if (match?.key) {
        cachedMessageFromLandingKey = match.key;
        return cachedMessageFromLandingKey;
      }

      const total = data?.metadata?.total ?? 0;
      offset += fields.length;
      if (!fields.length || offset >= total) break;
    }

    console.warn(`⚠️ Could not find extended field "${MESSAGE_FROM_LANDING_DISPLAY_NAME}".`);
    return null;
  } catch (err) {
    console.warn('⚠️ Error looking up extended field:', err?.message ?? err);
    return null;
  }
}

async function getExistingLabelKey(displayName, authHeaders) {
  if (!displayName) return null;

  try {
    const res = await fetch('https://www.wixapis.com/contacts/v4/labels', {
      method: 'GET',
      headers: authHeaders,
    });

    if (!res.ok) return null;

    const data = await res.json();
    const existing = (data?.labels ?? []).find(
      (l) => (l?.displayName ?? '').toLowerCase() === displayName.toLowerCase()
    );
    return existing?.key ?? null;
  } catch (err) {
    console.error(`Error looking up label "${displayName}":`, err);
    return null;
  }
}

async function findOrCreateLabel(displayName, authHeaders) {
  if (!displayName) return null;

  try {
    const res = await fetch('https://www.wixapis.com/contacts/v4/labels', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ displayName }),
    });

    if (!res.ok) {
      if (res.status === 409) return getExistingLabelKey(displayName, authHeaders);
      console.error('Error creating label:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return data?.label?.key ?? null;
  } catch (err) {
    console.error(`Error findOrCreate label "${displayName}":`, err);
    return null;
  }
}

async function labelContact(contactId, labelKeys, authHeaders) {
  try {
    const res = await fetch(`${WIX_API_BASE}/contacts/${contactId}/labels`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ labelKeys }),
    });

    if (!res.ok) {
      console.error(`Error labeling contact ${contactId}:`, res.status, await res.text());
    }
  } catch (err) {
    console.error(`Error labeling contact ${contactId}:`, err);
  }
}

// Wix rejects creating a contact whose email already exists. Returns the
// existing contact's ID in that case, otherwise null.
function getDuplicateContactId(errText) {
  try {
    const appError = JSON.parse(errText)?.details?.applicationError;
    if (appError?.code !== 'DUPLICATE_CONTACT_EXISTS') return null;
    return appError?.data?.duplicateContactId ?? null;
  } catch {
    return null;
  }
}

// Writes the new extended fields (role, message) onto an existing contact,
// leaving its name and email untouched.
async function updateContactExtendedFields(contactId, items, authHeaders) {
  const getRes = await fetch(`${WIX_API_BASE}/contacts/${contactId}`, {
    method: 'GET',
    headers: authHeaders,
  });

  if (!getRes.ok) {
    const errText = await getRes.text();
    throw new Error(`Wix API error ${getRes.status}: ${errText}`);
  }

  const { contact } = await getRes.json();

  // Keep the contact's other custom fields in case Wix replaces the whole map.
  const existingCustom = Object.fromEntries(
    Object.entries(contact?.info?.extendedFields?.items ?? {}).filter(([key]) =>
      key.startsWith('custom.')
    )
  );

  const updateRes = await fetch(`${WIX_API_BASE}/contacts/${contactId}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({
      revision: contact.revision,
      info: { extendedFields: { items: { ...existingCustom, ...items } } },
    }),
  });

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    throw new Error(`Wix API error ${updateRes.status}: ${errText}`);
  }

  return updateRes.json();
}

// ── Main Handler (Netlify Functions v2) ──────────────────────────────

export default async (req, context) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.WIX_API_KEY;
    const siteId = process.env.WIX_SITE_ID;

    if (!apiKey || !siteId) {
      console.error('Missing WIX_API_KEY or WIX_SITE_ID environment variables');
      return jsonResponse(500, { success: false, error: 'Missing environment variables' });
    }

    const authHeaders = wixHeaders(apiKey, siteId);

    let body;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { email, firstName, lastName, role, message } = body;

    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const messageForCrm = trimmedMessage || DEFAULT_LANDING_MESSAGE;

    // Build contact payload
    const contactInfo = {
      info: {
        name: { first: firstName, last: lastName },
        emails: { items: [{ email, primary: true }] },
        extendedFields: { items: {} },
      },
    };

    if (role) {
      contactInfo.info.extendedFields.items['custom.role'] = role;
    }

    const messageFieldKey = await getMessageFromLandingFieldKey(authHeaders);
    if (messageFieldKey) {
      contactInfo.info.extendedFields.items[messageFieldKey] = messageForCrm;
    } else {
      contactInfo.info.extendedFields.items['custom.message'] = messageForCrm;
    }

    // Create the contact
    const createRes = await fetch(`${WIX_API_BASE}/contacts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(contactInfo),
    });

    let createData;
    if (createRes.ok) {
      createData = await createRes.json();
    } else {
      const errText = await createRes.text();
      const duplicateContactId = getDuplicateContactId(errText);

      if (!duplicateContactId) {
        console.error('Wix create contact error:', createRes.status, errText);
        throw new Error(`Wix API error ${createRes.status}: ${errText}`);
      }

      // Returning subscriber: update their existing contact instead.
      createData = await updateContactExtendedFields(
        duplicateContactId,
        contactInfo.info.extendedFields.items,
        authHeaders
      );
    }

    const contactId = createData?.contact?.id;

    if (!contactId) {
      throw new Error('Wix CRM did not return a contact ID.');
    }

    // Label the contact (non-blocking — don't fail the whole request)
    try {
      const labelKeys = [];

      const landingLabelKey = await getExistingLabelKey('Interest from Landing', authHeaders);
      if (landingLabelKey) labelKeys.push(landingLabelKey);

      if (role) {
        const roleLabelKey = await findOrCreateLabel(role, authHeaders);
        if (roleLabelKey) labelKeys.push(roleLabelKey);
      }

      if (labelKeys.length > 0) {
        await labelContact(contactId, labelKeys, authHeaders);
      }
    } catch (labelError) {
      console.error('Error labeling contact:', labelError);
    }

    console.log('Contact saved successfully:', contactId);
    return jsonResponse(200, { success: true, data: createData });
  } catch (error) {
    console.error('Error creating contact:', error);
    return jsonResponse(500, { success: false, error: error.message });
  }
};