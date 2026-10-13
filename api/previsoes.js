const snapshot = require('./_snapshot');
const ENDPOINT = 'https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-previsoes';
module.exports = async (_req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'no-store');
  try {
    const response = await fetch(ENDPOINT);
    if (!response.ok) throw new Error('ora-previsoes ' + response.status);
    const data = await response.json();
    if (!data || data.schema !== 'ora-previsoes/v2') throw new Error('schema inesperado');
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (error) {
    // ORA 13/10/2026: Supabase fora de quota; serve a copia estatica, marcada como desactualizada.
    res.statusCode = 200;
    res.setHeader('x-ora-fonte', 'snapshot-desactualizado');
    res.end(JSON.stringify({ ...snapshot.previsoes(), upstream_error: String((error && error.message) || error) }));
  }
};
