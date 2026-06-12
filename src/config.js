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

// The flock. Each chicken's egg color drives the smart picker: choosing a
// color in the form surfaces the hens that lay it.
export const CHICKENS = [
  { name: 'Goldilocks', color: 'brown' },
  { name: 'Reba', color: 'brown' },
  { name: 'Mabel', color: 'brown' },
  { name: 'Clive', color: 'brown' },
  { name: 'Gimpy', color: 'blue' },
  { name: 'Mr Penguin', color: 'blue' },
  { name: 'Athena', color: 'blue' },
  { name: 'Tootsie', color: 'blue' },
  { name: 'Toni', color: 'olive' },
  { name: 'Randy Roo', color: 'olive' },
  { name: 'Thing #1', color: 'olive' },
  { name: 'Thing #2', color: 'olive' },
]

// Weight picker range (grams): drives the tens-row buttons (20s..70s).
export const WEIGHT_MIN = 20
export const WEIGHT_MAX = 79
