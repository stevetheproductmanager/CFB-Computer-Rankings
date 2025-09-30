
export const CONFERENCE_COLORS = {
  'SEC': '#1e90ff',
  'Big Ten': '#2ecc71',
  'ACC': '#e67e22',
  'Big 12': '#9b59b6',
  'Pac-12': '#e74c3c',
  'American Athletic': '#16a085',
  'Sun Belt': '#f1c40f',
  'Mountain West': '#7f8c8d',
  'Conference USA': '#2980b9',
  'MAC': '#8e44ad',
  'FBS Independents': '#95a5a6'
};

export function confColor(name) { return CONFERENCE_COLORS[name] || '#34495e'; }
