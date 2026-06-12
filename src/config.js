// App configuration — safe to commit (no secrets, no machine-specific details).

// Google Apps Script web app endpoint (deployed from the Sheet's script editor).
// Leave empty until the Apps Script is deployed; entries queue in localStorage.
export const APPS_SCRIPT_URL = ''

// Egg colors offered in the entry form.
export const COLORS = [
  { id: 'brown', label: 'Brown', swatch: '#8b5a3c' },
  { id: 'blue', label: 'Blue', swatch: '#a8c8d8' },
  { id: 'olive', label: 'Olive', swatch: '#8a8b5c' },
]

// The flock. Fill in real names; order here is display order.
export const CHICKENS = [
  'Chicken 1', 'Chicken 2', 'Chicken 3', 'Chicken 4',
  'Chicken 5', 'Chicken 6', 'Chicken 7', 'Chicken 8',
  'Chicken 9', 'Chicken 10', 'Chicken 11', 'Chicken 12',
]

// Sanity bounds for weight entry (grams).
export const WEIGHT_MIN = 20
export const WEIGHT_MAX = 100
