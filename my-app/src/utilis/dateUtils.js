// utils/dateUtils.js
export function validateDate(dateString) {
  const dateRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[012])\/(19|20)\d\d$/;
  
  if (!dateRegex.test(dateString)) {
    return false;
  }
  
  const [day, month, year] = dateString.split('/');
  const date = new Date(year, month - 1, day);
  
  return (
    date.getDate() === parseInt(day) &&
    date.getMonth() === parseInt(month) - 1 &&
    date.getFullYear() === parseInt(year)
  );
}

// Format a date string or Date to dd/mm/yyyy
export function formatToDDMMYYYY(input) {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear());
  return `${day}/${month}/${year}`;
}