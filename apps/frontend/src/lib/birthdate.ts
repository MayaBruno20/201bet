/** Idade mínima alinhada ao backend (AuthService / RegisterDto). */
export const MIN_AGE = 18;

export function isAdult(isoDate: string, minAge = MIN_AGE) {
  if (!isoDate) return false;
  const dob = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age >= minAge;
}

export function daysInMonth(year: number, month1to12: number) {
  return new Date(year, month1to12, 0).getDate();
}
