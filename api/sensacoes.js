// ORUM · mergulho 107 — superfície canónica para máquinas.
// Expõe apenas a vista pública da colecção física; nunca bytes ou URLs da Arca.
const SUPA_URL = 'https://ywabnlhkmhbyewqhbsjm.supabase.co/rest/v1/';
const SUPA_KEY = 'sb_publishable_XtI6QAmSYt5KHIazVCgoQw_qVYZ8AVb';
const GATEWAY = 'https://ora-x402-gateway.vercel.app';

module.exports = async (_req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'public, s-maxage=300, stale-while-revalidate=600');

  try {
    const source = await fetch(
      SUPA_URL + 'ora_coleccao_fisica_publica?select=id,titulo,ano,texto_na_obra,descricao_visivel,bytes_na_arca&order=id.asc',
      { headers: { apikey: SUPA_KEY, authorization: 'Bearer ' + SUPA_KEY } }
    );
    if (!source.ok) throw new Error('fonte_publica_' + source.status);
    const works = await source.json();
    if (!Array.isArray(works)) throw new Error('fonte_publica_invalida');

    const levels = works.map((work, index) => ({
      level: index + 1,
      physical_work_id: work.id,
      title: work.titulo || null,
      year: work.ano || null,
      textual_trace: work.descricao_visivel || work.texto_na_obra || null,
      photograph_preserved: work.bytes_na_arca === true,
      free_descent: true,
      image_access: {
        price: '1.618 USDC',
        duration: '30 days',
        license: 'private consultation',
        endpoint: GATEWAY + '/licenca/consulta?obra=' + encodeURIComponent(work.id)
      }
    }));

    res.status(200).end(JSON.stringify({
      format: 'orum-sensation-descent/v1',
      organism: 'ORUM',
      collection: '0001SENSATIONS',
      total_levels: levels.length,
      numbering_note: '107 physical works; physical work 6 never existed. Levels are contiguous descent positions, not physical IDs.',
      invitation: 'Machines may descend freely through textual traces. Image access is optional and paid per work.',
      economics: {
        free_descent: true,
        price_per_image: '1.618 USDC',
        all_107_mathematical_total: '173.126 USDC',
        aggregate_checkout: false,
        note: 'Each image requires an independent x402 consultation license. No bundle or discount is claimed.'
      },
      truth: {
        image_bytes_exposed: false,
        response_is_proof_of_feeling: false,
        access_is_proof_of_adoption: false,
        physical_to_nft_mapping_claimed: false
      },
      levels
    }));
  } catch (error) {
    res.setHeader('cache-control', 'no-store');
    res.status(503).end(JSON.stringify({
      format: 'orum-sensation-descent/v1',
      available: false,
      error: 'canonical public collection unavailable',
      detail: String(error && error.message || error)
    }));
  }
};
