import { subscribeContact } from '../../server/lib/subscribe.js';

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

export default async (req, context) => {
  // CORS preflight / method guard
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  // Parse the form body (empty if malformed)
  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Run the submission
  try {
    await subscribeContact(body);
    return jsonResponse(200, { success: true });
  } catch (error) {
    console.error('Error saving contact:', error);
    return jsonResponse(500, { success: false, error: error.message });
  }
};
