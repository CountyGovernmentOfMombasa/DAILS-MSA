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