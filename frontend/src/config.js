// Simple frontend config module
// Values can be overridden by Vite env vars (VITE_*)

export const CONFIG = {
  apiBase: import.meta.env.VITE_API_BASE || 'http://localhost:4000',
  appName: 'Shared Experiences'
}


