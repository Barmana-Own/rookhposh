const ApiError = require('../utils/apiError');
const { normalizeDigits } = require('../utils/number');
const FIELDS = ['bank_name', 'card_number', 'iban', 'account_holder'];

function cardValid(value) {
  if (!/^[0-9]{16}$/.test(value) || /^([0-9])\1+$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < value.length; i += 1) {
    let digit = Number(value[i]) * (i % 2 === 0 ? 2 : 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
}
function ibanValid(value) {
  if (!/^IR[0-9]{24}$/.test(value) || /^0+$/.test(value.slice(4))) return false;
  const check = Number(value.slice(2, 4));
  if (check < 2 || check > 98) return false;
  const rearranged = value.slice(4) + '1827' + value.slice(2, 4);
  let remainder = 0;
  for (const digit of rearranged) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
function bankInfoStatus(raw) {
  let value = raw;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = null; } }
  const malformed = !value || typeof value !== 'object' || Array.isArray(value) || FIELDS.some(key => value[key] != null && (typeof value[key] !== 'string' || value[key].length > 160));
  const info = Object.fromEntries(FIELDS.map((key) => [key, typeof value?.[key] === 'string' ? value[key].trim() : '']));
  info.card_number = normalizeDigits(info.card_number).replace(/[ -]/g, '');
  info.iban = normalizeDigits(info.iban).replace(/\s/g, '').toUpperCase();
  const invalidCard = info.card_number && !cardValid(info.card_number);
  const invalidIban = info.iban && !ibanValid(info.iban);
  const available = Boolean(!malformed && info.account_holder && (info.card_number || info.iban) && !invalidCard && !invalidIban);
  return { ...info, bank_transfer_available: available,
    unavailable_reason: available ? '' : 'اطلاعات حساب بانکی تکمیل نشده است' };
}
function validateBankInfo(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ApiError(400, 'اطلاعات حساب بانکی معتبر نیست.');
  for (const key of FIELDS) {
    if (payload[key] != null && (typeof payload[key] !== 'string' || payload[key].length > 160)) throw new ApiError(400, 'اطلاعات حساب بانکی معتبر نیست.');
  }
  const info = bankInfoStatus(payload);
  if (info.card_number && !cardValid(info.card_number)) throw new ApiError(400, 'شماره کارت معتبر نیست.');
  if (info.iban && !ibanValid(info.iban)) throw new ApiError(400, 'شماره شبا معتبر نیست.');
  if (FIELDS.some((key) => info[key]) && !info.bank_transfer_available) throw new ApiError(400, 'نام صاحب حساب و شماره کارت یا شبای معتبر لازم است.');
  return Object.fromEntries(FIELDS.map((key) => [key, info[key]]));
}
function publicBankInfo(raw) {
  const info = bankInfoStatus(raw);
  return info.bank_transfer_available ? info : { bank_transfer_available: false, unavailable_reason: info.unavailable_reason };
}
function requireBankInfo(raw) {
  const info = bankInfoStatus(raw);
  if (!info.bank_transfer_available) throw new ApiError(409, 'واریز حساب در حال حاضر در دسترس نیست؛ اطلاعات حساب بانکی تکمیل نشده است.');
  return Object.fromEntries(FIELDS.map((key) => [key, info[key]]));
}
module.exports = { cardValid, ibanValid, bankInfoStatus, validateBankInfo, publicBankInfo, requireBankInfo };
