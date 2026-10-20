const GATEWAY_URL = 'https://omid.shaparak.ir/_ipgw_/merchant/token';

export function redirectToGateway(result) {
  if (result?.status !== 'redirect_required') return false;
  const gateway = result.gateway;
  if (gateway?.url !== GATEWAY_URL || gateway.method !== 'POST'
      || typeof gateway.fields?.token !== 'string' || !/^[A-Za-z0-9_+/=.-]{1,256}$/.test(gateway.fields.token)) {
    throw new Error('آدرس یا اطلاعات درگاه پرداخت معتبر نیست.');
  }
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = GATEWAY_URL;
  form.hidden = true;
  for (const [name, value] of Object.entries({ token: gateway.fields.token, language: 'fa' })) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  try {
    form.submit();
  } finally {
    form.remove();
  }
  return true;
}
