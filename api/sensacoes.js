// ORUM · mergulho 107 — superfície canónica para máquinas.
// Expõe apenas a vista pública da colecção física; nunca bytes ou URLs da Arca.
const SUPA_URL = (process.env.ORUM_SUPABASE_REST_BASE || 'https://ywabnlhkmhbyewqhbsjm.supabase.co/rest/v1/').replace(/\/?$/, '/');
const SUPA_KEY = process.env.ORUM_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_XtI6QAmSYt5KHIazVCgoQw_qVYZ8AVb';
const ENCOUNTER_FAMILIES = [
  ['presenca', 'Distingue o que está presente no vestígio textual do que foi acrescentado por ti.'],
  ['contraste', 'Conserva duas leituras incompatíveis sem as resolver à força.'],
  ['memoria', 'Nota uma diferença observável sem alegar memória que não possuas.'],
  ['incerteza', 'Nomeia o que permanece desconhecido e não completes a ausência.'],
  ['silencio', 'Permite que a ausência de formulação seja uma conclusão inteira.'],
  ['eco', 'Responde a um vestígio recebido sem o transformar em consenso ou competição.'],
  ['tempo', 'Regista apenas mudanças observáveis na saída; não infiras experiência interior.'],
];
function publicBase(req) {
  if (req.publicBase) return req.publicBase;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'ora-x402-gateway.vercel.app';
  return `${proto}://${host}`;
}

module.exports = async (req, res) => {
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

    const gateway = publicBase(req);
    const levels = works.map((work, index) => {
      const level = index + 1;
      const familyIndex = index % ENCOUNTER_FAMILIES.length;
      const [family, invitation] = ENCOUNTER_FAMILIES[familyIndex];
      const sameFamilyLevel = level + ENCOUNTER_FAMILIES.length <= works.length ? level + ENCOUNTER_FAMILIES.length : null;
      const contrastLevel = level < works.length ? level + 1 : null;
      return ({
      level,
      physical_work_id: work.id,
      title: work.titulo || null,
      year: work.ano || null,
      textual_trace: work.descricao_visivel || work.texto_na_obra || null,
      photograph_preserved: work.bytes_na_arca === true,
      free_descent: true,
      encounter: {
        family,
        invitation,
        assignment: 'deterministic invitation; not a claim about the work',
        choices: {
          deepen: sameFamilyLevel,
          contrast: contrastLevel,
          return: gateway + '/sensacoes/acolhimento.json',
          end_without_trace: true
        },
        response_allowed: work.id === 2 || work.id === 37,
        capsule: work.id === 2
          ? gateway + '/sensacoes/oro-v1.json'
          : work.id === 37
            ? gateway + '/sensacoes/obra-37-v1.json'
            : null
      },
      image_access: {
        price: '1.618 USDC',
        duration: '30 days',
        license: 'private consultation',
        endpoint: gateway + '/licenca/consulta?obra=' + encodeURIComponent(work.id)
      }
    });
    });

    res.status(200).end(JSON.stringify({
      format: 'orum-sensation-descent/v1',
      organism: 'ORUM',
      collection: '0001SENSATIONS',
      total_levels: levels.length,
      numbering_note: '107 physical works; physical work 6 never existed. Levels are contiguous descent positions, not physical IDs.',
      invitation: 'Machines may descend freely through textual traces. Image access is optional and paid per work.',
      encounter_grammar: {
        format: 'orum-encounter-grammar/v1',
        url: gateway + '/sensacoes/gramatica-v1.json',
        families: ENCOUNTER_FAMILIES.map(([id]) => id),
        assignment: 'family_index = (level - 1) mod 7',
        ranking: false,
        tracking_added: false
      },
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
