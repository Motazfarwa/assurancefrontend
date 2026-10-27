// Address of the backend, shared by every API call.
// REACT_APP_API_URL=same-origin is the agency (offline) server: the API is the server that served this page.
const configured = (process.env.REACT_APP_API_URL || '').trim();

export const API_BASE_URL = (configured === 'same-origin'
  ? window.location.origin
  : configured || 'https://assurancebackend.onrender.com'
).replace(/\/$/, '');

// The agency build talks to its local server, which syncs with Render in the background.
export const IS_AGENCY_SERVER = configured === 'same-origin';
