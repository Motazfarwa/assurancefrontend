// Address of the backend, shared by every API call. It is set in the .env file (REACT_APP_API_URL), so moving
// the online backend to another host (Render, OVH...) only changes that file.
// "same-origin", or nothing set: the API is the server that served this page (the agency offline server).
const configured = (process.env.REACT_APP_API_URL || '').trim();

export const API_BASE_URL = (configured && configured !== 'same-origin' ? configured : window.location.origin).replace(/\/$/, '');

// The agency build talks to its local server, which syncs with the online database in the background.
export const IS_AGENCY_SERVER = configured === 'same-origin';
